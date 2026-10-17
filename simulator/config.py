"""Configuration settings for the standalone factory and conveyor simulator."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class SimulatorSettings(BaseSettings):
    """Configuration parameters for the factory simulator."""

    model_config = SettingsConfigDict(env_file=".env", extra="allow")

    app_env: str = os.getenv("APP_ENV", "development")
    factory_api_key: Optional[str] = os.getenv("FACTORY_API_KEY", None)

    mqtt_broker_host: str = os.getenv("MQTT_BROKER_HOST", "broker.emqx.io")
    mqtt_broker_port: int = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    mqtt_keepalive: int = 60
    mqtt_base_topic: str = os.getenv("MQTT_BASE_TOPIC", "aibuilder/factory01/line01")

    # Timing & execution
    tick_interval_sec: float = float(os.getenv("SIMULATOR_TICK_SEC", "2.0"))
    speed_multiplier: float = float(os.getenv("SIMULATOR_SPEED", "1.0"))
    telemetry_publish_interval_sec: float = float(
        os.getenv("SIMULATOR_TELEMETRY_PUBLISH_SEC", "10.0")
    )

    # CSV telemetry replay (TKT-071 / issue #269)
    # When set, the factory service reads telemetry from this CSV file instead
    # of generating synthetic Gaussian numbers. Activate via env var
    # SIMULATOR_CSV_REPLAY_PATH=/abs/path/to/file.csv (or CLI --csv-replay).
    csv_replay_path: Optional[Path] = None

    # Google Cloud Pub/Sub & Edge Dispatch
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "kaizen-local")
    pubsub_emulator_host: str | None = os.getenv("PUBSUB_EMULATOR_HOST", None)
    pubsub_enabled: bool = os.getenv("SIMULATOR_PUBSUB_ENABLED", "false").lower() in (
        "true",
        "1",
        "yes",
    )
    pubsub_quality_events_topic: str = os.getenv(
        "PUBSUB_QUALITY_EVENTS_TOPIC", "kaizen-quality-events"
    )
    pubsub_telemetry_topic: str = os.getenv(
        "PUBSUB_MACHINE_TELEMETRY_TOPIC",
        os.getenv("PUBSUB_TELEMETRY_TOPIC", "kaizen-telemetry"),
    )
    pubsub_traceability_topic: str = os.getenv("PUBSUB_TRACEABILITY_TOPIC", "kaizen-traceability")

    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    @classmethod
    def from_env(cls) -> "SimulatorSettings":
        """Helper to construct an instance while honouring the SIMULATOR_CSV_REPLAY_PATH env var."""
        raw_path = os.getenv("SIMULATOR_CSV_REPLAY_PATH")
        path: Optional[Path] = None
        if raw_path:
            candidate = Path(raw_path).expanduser()
            if candidate.exists():
                path = candidate
        return cls(csv_replay_path=path)


settings = SimulatorSettings.from_env()
