"""Configuration settings for the standalone factory and conveyor simulator."""

from __future__ import annotations

import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class SimulatorSettings(BaseSettings):
    """Configuration parameters for the factory simulator."""

    model_config = SettingsConfigDict(env_file=".env", extra="allow")

    mqtt_broker_host: str = os.getenv("MQTT_BROKER_HOST", "broker.emqx.io")
    mqtt_broker_port: int = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    mqtt_keepalive: int = 60
    mqtt_base_topic: str = os.getenv("MQTT_BASE_TOPIC", "aibuilder/factory01/line01")

    # Timing & execution
    tick_interval_sec: float = float(os.getenv("SIMULATOR_TICK_SEC", "2.0"))
    speed_multiplier: float = float(os.getenv("SIMULATOR_SPEED", "1.0"))

    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")


settings = SimulatorSettings()
