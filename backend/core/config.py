"""Core Config: Application configuration and settings."""

from __future__ import annotations

import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="allow")

    app_name: str = "Kaizen Agent Platform"
    version: str = "0.1.0"
    debug: bool = True
    port: int = 8000
    host: str = "0.0.0.0"
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "kaizen-local")
    gcp_region: str = os.getenv("GCP_REGION", "asia-southeast1")

    # BigQuery / Emulator settings
    bigquery_emulator_host: Optional[str] = os.getenv("BIGQUERY_EMULATOR_HOST", None)
    bigquery_dataset: str = os.getenv("BIGQUERY_DATASET", "manufacturing")

    # EMQX MQTT Settings
    mqtt_broker_host: str = os.getenv("MQTT_BROKER_HOST", "broker.emqx.io")
    mqtt_broker_port: int = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    mqtt_broker_ws_port: int = int(os.getenv("MQTT_BROKER_WS_PORT", "8084"))
    mqtt_base_topic: str = os.getenv("MQTT_BASE_TOPIC", "aibuilder/factory01/line01")
    mqtt_keepalive: int = int(os.getenv("MQTT_KEEPALIVE", "60"))
    mqtt_reconnect_min_delay: float = float(os.getenv("MQTT_RECONNECT_MIN_DELAY", "1.0"))
    mqtt_reconnect_max_delay: float = float(os.getenv("MQTT_RECONNECT_MAX_DELAY", "60.0"))
    mqtt_anomaly_threshold: float = float(os.getenv("MQTT_ANOMALY_THRESHOLD", "0.70"))


settings = Settings()
