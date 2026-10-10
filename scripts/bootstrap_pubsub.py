"""Standalone script to bootstrap Pub/Sub topics and subscriptions for development."""

from __future__ import annotations

import argparse
import logging
import os
import sys

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.config import settings
from backend.core.pubsub_manager import pubsub_manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def bootstrap_pubsub(
    project_id: str | None = None,
    emulator_host: str | None = None,
) -> bool:
    """Provisions topics and subscriptions on target project or emulator."""
    proj = project_id or settings.gcp_project_id
    host = emulator_host or settings.pubsub_emulator_host or os.environ.get("PUBSUB_EMULATOR_HOST")

    if host:
        os.environ["PUBSUB_EMULATOR_HOST"] = host
        logger.info("Using Pub/Sub emulator at %s for project %s", host, proj)
    else:
        logger.info("Connecting to Google Cloud Pub/Sub for project %s", proj)

    pubsub_manager.reset_availability_cache()
    success = pubsub_manager.ensure_topics_and_subscriptions(project_id=proj)

    if success:
        logger.info("Pub/Sub bootstrap completed successfully.")
        logger.info(
            "Topics: %s, %s, %s",
            settings.pubsub_telemetry_topic,
            settings.pubsub_traceability_topic,
            settings.pubsub_quality_events_topic,
        )
        logger.info(
            "Subscriptions: %s, %s, %s",
            settings.pubsub_telemetry_sub,
            settings.pubsub_traceability_sub,
            settings.pubsub_quality_events_sub,
        )
    else:
        logger.error("Pub/Sub bootstrap encountered errors.")

    return success


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap Pub/Sub topics and subscriptions")
    parser.add_argument(
        "--project",
        default=settings.gcp_project_id,
        help="GCP Project ID (default: settings.gcp_project_id)",
    )
    parser.add_argument(
        "--emulator-host",
        default=None,
        help="Pub/Sub emulator host e.g. localhost:8085",
    )
    args = parser.parse_args()

    success = bootstrap_pubsub(
        project_id=args.project,
        emulator_host=args.emulator_host,
    )
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
