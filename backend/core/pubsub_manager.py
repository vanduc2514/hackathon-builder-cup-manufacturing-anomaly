"""Pub/Sub Manager: Enterprise event ingestion bridge between Edge Gateway, BigQuery, and Orchestrator."""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from google.api_core.exceptions import AlreadyExists
from google.auth.credentials import AnonymousCredentials
from google.cloud import pubsub_v1

from backend.core.config import settings
from backend.core.models import (
    MachineTelemetryPayload,
    QualityEventPayload,
    TraceabilityEventPayload,
)

logger = logging.getLogger(__name__)


class PubSubManager:
    """Manages Google Cloud Pub/Sub publishing, subscriptions, and edge-to-cloud ingestion pipelines."""

    def __init__(self) -> None:
        self._publisher: Optional[pubsub_v1.PublisherClient] = None
        self._subscriber: Optional[pubsub_v1.SubscriberClient] = None
        self._streaming_pull_futures: List[Any] = []
        self._subscribers_started: bool = False
        self._cached_available: Optional[bool] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._seen_events: OrderedDict[str, float] = OrderedDict()
        self._dedup_lock: threading.Lock = threading.Lock()

    @property
    def emulator_host(self) -> Optional[str]:
        """Returns active PUBSUB_EMULATOR_HOST if specified in settings or environment."""
        return settings.pubsub_emulator_host or os.environ.get("PUBSUB_EMULATOR_HOST")

    @property
    def is_emulator(self) -> bool:
        """True if running against a local Pub/Sub emulator."""
        return bool(self.emulator_host)

    def is_available(self) -> bool:
        """Checks if Pub/Sub client can be initialized and reached."""
        if self._cached_available is not None:
            return self._cached_available

        try:
            client = self.get_publisher_client()
            if self.is_emulator:
                # Test connectivity to emulator with bounded timeout
                proj_path = f"projects/{settings.gcp_project_id}"
                pager = client.list_topics(request={"project": proj_path}, timeout=2.0)
                next(iter(pager), None)
            self._cached_available = True
            return True
        except Exception as exc:
            logger.debug("Pub/Sub unavailable (%s); falling back to direct ingestion", exc)
            self._cached_available = False
            return False

    def reset_availability_cache(self) -> None:
        """Clears cached availability check (useful during test fixtures)."""
        self._cached_available = None
        self._publisher = None
        self._subscriber = None
        self._loop = None
        with self._dedup_lock:
            self._seen_events.clear()

    def get_publisher_client(self) -> pubsub_v1.PublisherClient:
        """Returns a cached PublisherClient configured for emulator or production ADC."""
        if self._publisher is not None:
            return self._publisher

        host = self.emulator_host
        if host:
            os.environ["PUBSUB_EMULATOR_HOST"] = host
            self._publisher = pubsub_v1.PublisherClient(credentials=AnonymousCredentials())
        else:
            self._publisher = pubsub_v1.PublisherClient()
        return self._publisher

    def get_subscriber_client(self) -> pubsub_v1.SubscriberClient:
        """Returns a cached SubscriberClient configured for emulator or production ADC."""
        if self._subscriber is not None:
            return self._subscriber

        host = self.emulator_host
        if host:
            os.environ["PUBSUB_EMULATOR_HOST"] = host
            self._subscriber = pubsub_v1.SubscriberClient(credentials=AnonymousCredentials())
        else:
            self._subscriber = pubsub_v1.SubscriberClient()
        return self._subscriber

    def get_topic_path(self, topic_name: str, project_id: Optional[str] = None) -> str:
        """Constructs canonical Pub/Sub topic path."""
        proj = project_id or settings.gcp_project_id
        return f"projects/{proj}/topics/{topic_name}"

    def get_subscription_path(self, sub_name: str, project_id: Optional[str] = None) -> str:
        """Constructs canonical Pub/Sub subscription path."""
        proj = project_id or settings.gcp_project_id
        return f"projects/{proj}/subscriptions/{sub_name}"

    def ensure_topics_and_subscriptions(self, project_id: Optional[str] = None) -> bool:
        """Idempotently provisions topics and subscriptions on the target project/emulator."""
        proj = project_id or settings.gcp_project_id
        publisher = self.get_publisher_client()
        subscriber = self.get_subscriber_client()

        topic_specs = [
            settings.pubsub_telemetry_topic,
            settings.pubsub_traceability_topic,
            settings.pubsub_quality_events_topic,
        ]

        for topic in topic_specs:
            topic_path = self.get_topic_path(topic, proj)
            try:
                publisher.create_topic(request={"name": topic_path})
                logger.info("Created Pub/Sub topic: %s", topic_path)
            except AlreadyExists:
                logger.debug("Pub/Sub topic already exists: %s", topic_path)
            except Exception as exc:
                logger.warning("Could not create Pub/Sub topic %s: %s", topic_path, exc)
                return False

        sub_specs = [
            (settings.pubsub_telemetry_sub, settings.pubsub_telemetry_topic),
            (settings.pubsub_traceability_sub, settings.pubsub_traceability_topic),
            (settings.pubsub_quality_events_sub, settings.pubsub_quality_events_topic),
        ]

        for sub, topic in sub_specs:
            sub_path = self.get_subscription_path(sub, proj)
            topic_path = self.get_topic_path(topic, proj)
            try:
                subscriber.create_subscription(request={"name": sub_path, "topic": topic_path})
                logger.info("Created Pub/Sub subscription: %s -> %s", sub_path, topic_path)
            except AlreadyExists:
                logger.debug("Pub/Sub subscription already exists: %s", sub_path)
            except Exception as exc:
                logger.warning("Could not create subscription %s: %s", sub_path, exc)
                return False

        return True

    def publish_message(
        self,
        topic_name: str,
        data: bytes | str,
        attributes: Optional[Dict[str, str]] = None,
        project_id: Optional[str] = None,
    ) -> Optional[str]:
        """Publishes raw bytes or string payload to specified topic."""
        payload = data.encode("utf-8") if isinstance(data, str) else data
        attrs = attributes or {}
        topic_path = self.get_topic_path(topic_name, project_id)

        try:
            client = self.get_publisher_client()
            future = client.publish(topic_path, payload, **attrs)
            message_id = future.result(timeout=10.0)
            logger.debug("Published Pub/Sub message %s to %s", message_id, topic_path)
            return str(message_id)
        except Exception as exc:
            logger.warning("Pub/Sub publish failed to %s: %s", topic_path, exc)
            return None

    def publish_telemetry(self, payload: MachineTelemetryPayload) -> bool:
        """Publishes machine telemetry to Pub/Sub telemetry topic, with direct fallback."""
        data_json = payload.model_dump_json()
        msg_id = None
        if self.is_available():
            msg_id = self.publish_message(settings.pubsub_telemetry_topic, data_json)

        if msg_id is None and settings.pubsub_fallback_to_direct:
            from backend.tools.bigquery_tool import stream_sensor_telemetry

            stream_sensor_telemetry(payload)
            return True

        return msg_id is not None

    def publish_traceability(self, payload: TraceabilityEventPayload) -> bool:
        """Publishes discrete part event to Pub/Sub traceability topic, with direct fallback."""
        data_json = payload.model_dump_json()
        msg_id = None
        if self.is_available():
            msg_id = self.publish_message(settings.pubsub_traceability_topic, data_json)

        if msg_id is None and settings.pubsub_fallback_to_direct:
            from backend.tools.bigquery_tool import stream_traceability_record

            stream_traceability_record(payload)
            return True

        return msg_id is not None

    publish_traceability_record = publish_traceability

    def publish_quality_event(self, payload: QualityEventPayload) -> bool:
        """Publishes defect/SPC breach event to quality-events topic, triggering Orchestrator."""
        if not self.is_available():
            return False

        data_json = payload.model_dump_json()
        msg_id = self.publish_message(settings.pubsub_quality_events_topic, data_json)
        return msg_id is not None

    # -------------------------------------------------------------------------
    # Subscriber Callbacks & Lifecycle
    # -------------------------------------------------------------------------

    def _handle_telemetry_message(self, message: Any) -> None:
        """Callback ingesting telemetry packets from Pub/Sub into BigQuery."""
        try:
            data_str = message.data.decode("utf-8")
            telemetry = MachineTelemetryPayload.model_validate_json(data_str)
            from backend.tools.bigquery_tool import stream_sensor_telemetry

            stream_sensor_telemetry(telemetry)
            message.ack()
        except Exception as exc:
            logger.error("Error processing Pub/Sub telemetry message: %s", exc)
            message.nack()

    def _handle_traceability_message(self, message: Any) -> None:
        """Callback ingesting traceability packets from Pub/Sub into BigQuery."""
        try:
            data_str = message.data.decode("utf-8")
            record = TraceabilityEventPayload.model_validate_json(data_str)
            from backend.tools.bigquery_tool import stream_traceability_record

            stream_traceability_record(record)
            message.ack()
        except Exception as exc:
            logger.error("Error processing Pub/Sub traceability message: %s", exc)
            message.nack()

    def _handle_quality_event_message(self, message: Any) -> None:
        """Callback receiving quality-events to trigger Orchestrator (single-flight)."""
        try:
            data_str = message.data.decode("utf-8")
            event = QualityEventPayload.model_validate_json(data_str)

            # 1. Stale event check: ack + drop if timestamp older than max_age
            try:
                evt_dt = datetime.fromisoformat(event.timestamp)
                if evt_dt.tzinfo is None:
                    evt_dt = evt_dt.replace(tzinfo=timezone.utc)
                now_utc = datetime.now(timezone.utc)
                age_seconds = (now_utc - evt_dt).total_seconds()
                if age_seconds > settings.quality_event_max_age_seconds:
                    logger.info(
                        "Dropped stale quality event %s (age=%.1fs > max_age=%ds)",
                        event.event_id,
                        age_seconds,
                        settings.quality_event_max_age_seconds,
                    )
                    message.ack()
                    return
            except Exception as exc:
                logger.warning(
                    "Unparsable timestamp %s in quality event %s; processing anyway: %s",
                    event.timestamp,
                    event.event_id,
                    exc,
                )

            # 2. Duplicate event_id check: ack + drop duplicate event_id seen within TTL
            with self._dedup_lock:
                now_mono = time.monotonic()
                while self._seen_events:
                    oldest_id, oldest_time = next(iter(self._seen_events.items()))
                    if (
                        now_mono - oldest_time > settings.quality_event_dedup_ttl_seconds
                        or len(self._seen_events) > 1000
                    ):
                        self._seen_events.popitem(last=False)
                    else:
                        break

                if event.event_id in self._seen_events:
                    logger.info(
                        "Dropped duplicate quality event %s seen within TTL (%ds)",
                        event.event_id,
                        settings.quality_event_dedup_ttl_seconds,
                    )
                    message.ack()
                    return

            # 3. Single-flight guard: ignore & ack duplicate events when incident is active
            from backend.agents.orchestrator import orchestrator

            if orchestrator.is_running:
                logger.info(
                    "Ignored duplicate quality event %s while incident is active", event.event_id
                )
                with self._dedup_lock:
                    self._seen_events[event.event_id] = time.monotonic()
                message.ack()
                return

            trigger = event.to_defect_injection_request()
            if self._loop and self._loop.is_running():
                self._loop.call_soon_threadsafe(orchestrator.start_incident, trigger)
                started = True
            else:
                started = orchestrator.start_incident(trigger)
            logger.info("Quality event %s dispatched to Orchestrator: %s", event.event_id, started)
            with self._dedup_lock:
                self._seen_events[event.event_id] = time.monotonic()
            message.ack()
        except Exception as exc:
            if "event" in locals() and hasattr(event, "event_id"):
                with self._dedup_lock:
                    self._seen_events.pop(event.event_id, None)
            logger.error("Error processing Pub/Sub quality event message: %s", exc)
            message.nack()

    def start_subscribers(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> bool:
        """Starts asynchronous subscriber workers for telemetry, traceability, and quality-events."""
        if self._subscribers_started:
            return True

        if loop is not None:
            self._loop = loop
        else:
            try:
                self._loop = asyncio.get_running_loop()
            except RuntimeError:
                pass

        if not self.is_available():
            logger.info("Pub/Sub subscribers not started: service is unavailable / offline")
            return False

        try:
            # Real projects get topics/subscriptions from Terraform (infra/terraform/pubsub.tf),
            # so the runtime only needs publish/subscribe rights; the emulator starts empty.
            if self.is_emulator:
                self.ensure_topics_and_subscriptions()
            subscriber = self.get_subscriber_client()

            handlers = [
                (settings.pubsub_telemetry_sub, self._handle_telemetry_message),
                (settings.pubsub_traceability_sub, self._handle_traceability_message),
                (settings.pubsub_quality_events_sub, self._handle_quality_event_message),
            ]

            for sub_name, callback in handlers:
                sub_path = self.get_subscription_path(sub_name)
                future = subscriber.subscribe(sub_path, callback=callback)
                self._streaming_pull_futures.append(future)
                logger.info("Started Pub/Sub streaming pull on: %s", sub_path)

            self._subscribers_started = True
            return True
        except Exception as exc:
            logger.warning("Could not start Pub/Sub subscribers: %s", exc)
            return False

    def stop_subscribers(self) -> None:
        """Cancels all active streaming pull subscriber futures."""
        for future in self._streaming_pull_futures:
            try:
                future.cancel()
            except Exception as exc:
                logger.debug("Error cancelling subscriber future: %s", exc)
        self._streaming_pull_futures.clear()
        self._subscribers_started = False
        logger.info("Pub/Sub subscribers stopped")


pubsub_manager = PubSubManager()
