"""In-process rate limiting: token buckets per caller plus a concurrent-stream cap, as ASGI middleware."""

from __future__ import annotations

import json
import logging
import math
import time
from collections.abc import Callable
from dataclasses import dataclass

from starlette.requests import HTTPConnection
from starlette.types import ASGIApp, Receive, Scope, Send

from backend.core.auth import AuthError, decode_token, token_from
from backend.core.config import settings

logger = logging.getLogger(__name__)

# Long-lived routes counted against the concurrent-stream cap (SSE + Gemini Live WebSocket).
STREAM_PATHS = frozenset({"/api/incidents/stream", "/api/incidents/events", "/api/gemini-live/ws"})
LOGIN_PATH = "/api/auth/login"
_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# Buckets idle long enough to be full again carry no state; drop them past this many keys.
_PRUNE_ABOVE = 10_000


@dataclass(frozen=True)
class Rule:
    """A token bucket: ``capacity`` requests per ``period`` seconds, refilled continuously."""

    name: str
    capacity: int
    period: float

    @property
    def rate(self) -> float:
        return self.capacity / self.period


@dataclass
class _Bucket:
    tokens: float
    updated: float


class RateLimiter:
    """Token buckets keyed by (rule, caller) plus open-stream counters; single-process state.

    Cloud Run runs one instance (max_instances = 1), so in-memory state is the whole picture.
    """

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._buckets: dict[tuple[str, str], _Bucket] = {}
        self._streams: dict[str, int] = {}

    def hit(self, rule: Rule, key: str) -> float | None:
        """Consumes one token; returns None if allowed, else seconds until a token frees up."""
        bucket = self._refill(rule, key)
        if bucket.tokens >= 1:
            bucket.tokens -= 1
            return None
        return (1 - bucket.tokens) / rule.rate

    def blocked(self, rule: Rule, key: str) -> float | None:
        """Like hit, without consuming: seconds to wait when the bucket is empty, else None."""
        bucket = self._refill(rule, key)
        return None if bucket.tokens >= 1 else (1 - bucket.tokens) / rule.rate

    def _refill(self, rule: Rule, key: str) -> _Bucket:
        now = self._clock()
        bucket = self._buckets.get((rule.name, key))
        if bucket is None:
            if len(self._buckets) >= _PRUNE_ABOVE:
                self._prune(now)
            bucket = _Bucket(tokens=float(rule.capacity), updated=now)
            self._buckets[(rule.name, key)] = bucket
        else:
            bucket.tokens = min(rule.capacity, bucket.tokens + (now - bucket.updated) * rule.rate)
            bucket.updated = now
        return bucket

    def open_stream(self, key: str, limit: int) -> bool:
        """Reserves a stream slot for ``key``; False when it already holds ``limit`` streams."""
        if self._streams.get(key, 0) >= limit:
            return False
        self._streams[key] = self._streams.get(key, 0) + 1
        return True

    def close_stream(self, key: str) -> None:
        """Releases a slot taken by open_stream."""
        remaining = self._streams.get(key, 0) - 1
        if remaining > 0:
            self._streams[key] = remaining
        else:
            self._streams.pop(key, None)

    def reset(self) -> None:
        """Forgets every bucket and stream counter."""
        self._buckets.clear()
        self._streams.clear()

    def _prune(self, now: float) -> None:
        # Bucket names are rule names; a bucket refilled to capacity equals a fresh one.
        current = rules()
        for name_key, bucket in list(self._buckets.items()):
            rule = current.get(name_key[0])
            if rule is None or bucket.tokens + (now - bucket.updated) * rule.rate >= rule.capacity:
                del self._buckets[name_key]


def rules() -> dict[str, Rule]:
    """Current rules by name, read from settings per call so env overrides and tests apply.

    - default: any request; write: POST/PUT/PATCH/DELETE; login: login attempts per caller.
    - login_failure: failed logins per username in 5 minutes; caps password guessing
      whatever the source IP (consumed by the login route, not the middleware).
    """
    return {
        rule.name: rule
        for rule in (
            Rule("default", settings.rate_limit_per_minute, 60.0),
            Rule("write", settings.rate_limit_write_per_minute, 60.0),
            Rule("login", settings.rate_limit_login_per_minute, 60.0),
            Rule("login_failure", settings.rate_limit_login_failures, 300.0),
        )
    }


rate_limiter = RateLimiter()


def client_ip(scope: Scope) -> str:
    """Address that connected to Google's front end: the right-most X-Forwarded-For hop.

    Earlier hops are client-supplied and spoofable. Behind Firebase Hosting this is the CDN
    edge, so anonymous limits are shared per edge; per-user and per-username limits are not.
    """
    for name, value in scope.get("headers", []):
        if name == b"x-forwarded-for":
            hops = [hop.strip() for hop in value.decode("latin-1").split(",") if hop.strip()]
            if hops:
                return hops[-1]
    client = scope.get("client")
    return client[0] if client else "unknown"


def caller_key(scope: Scope) -> str:
    """``user:<name>`` for a valid token, else ``ip:<addr>``."""
    token = token_from(HTTPConnection(scope))
    if token:
        try:
            return f"user:{decode_token(token).username}"
        except AuthError:
            pass
    return f"ip:{client_ip(scope)}"


def _rule_for(method: str, path: str) -> Rule:
    current = rules()
    if path == LOGIN_PATH:
        return current["login"]
    if method in _WRITE_METHODS:
        return current["write"]
    return current["default"]


class RateLimitMiddleware:
    """Applies the request-rate rules to every HTTP/WebSocket call and caps open streams per caller."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket") or not settings.rate_limit_enabled:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "GET") if scope["type"] == "http" else "GET"
        key = caller_key(scope)
        rule = _rule_for(method, path)
        retry_after = rate_limiter.hit(rule, key)
        if retry_after is not None:
            logger.warning("Rate limit %s exceeded by %s on %s %s", rule.name, key, method, path)
            await _reject(scope, send, retry_after, "Too many requests")
            return

        if path not in STREAM_PATHS:
            await self.app(scope, receive, send)
            return
        if not rate_limiter.open_stream(key, settings.rate_limit_max_streams):
            logger.warning("Stream cap exceeded by %s on %s", key, path)
            await _reject(scope, send, None, "Too many open streams")
            return
        try:
            await self.app(scope, receive, send)
        finally:
            rate_limiter.close_stream(key)


async def _reject(scope: Scope, send: Send, retry_after: float | None, detail: str) -> None:
    """429 for HTTP; policy-violation close (1008) for a WebSocket handshake."""
    if scope["type"] == "websocket":
        await send({"type": "websocket.close", "code": 1008, "reason": detail})
        return
    headers = [(b"content-type", b"application/json")]
    if retry_after is not None:
        headers.append((b"retry-after", str(max(1, math.ceil(retry_after))).encode()))
    await send({"type": "http.response.start", "status": 429, "headers": headers})
    await send({"type": "http.response.body", "body": json.dumps({"detail": detail}).encode()})
