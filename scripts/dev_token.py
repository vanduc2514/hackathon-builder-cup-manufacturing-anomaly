"""Writes an API token for the first AUTH_USERS account to stdout (local curl tasks)."""

from __future__ import annotations

import logging
import os
import sys

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.auth import AuthError, authenticate, issue_token
from backend.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    if not settings.auth_users:
        logger.error("AUTH_USERS is empty")
        sys.exit(1)
    account = settings.auth_users[0]
    user = authenticate(account.username, account.password)
    if user is None:
        logger.error("AUTH_USERS account %r failed to authenticate", account.username)
        sys.exit(1)
    try:
        sys.stdout.write(issue_token(user).token)
    except AuthError as exc:
        logger.error(exc.detail)
        sys.exit(1)


if __name__ == "__main__":
    main()
