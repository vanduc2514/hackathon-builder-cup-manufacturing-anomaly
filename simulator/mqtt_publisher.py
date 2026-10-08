"""MQTT Publisher sending machine telemetry and conveyor events to EMQX."""

from __future__ import annotations

import logging
from typing import Any, Optional

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None  # type: ignore[assignment]

from simulator.config import settings
from simulator.models import ConveyorPart, MachineTelemetry

logger = logging.getLogger(__name__)


class MqttPublisher:
    """Manages the MQTT connection and publishing for the factory floor simulator."""

    def __init__(self, dry_run: bool = False) -> None:
        self.dry_run = dry_run
        self.client: Optional[Any] = None
        self.connected = False

        if not self.dry_run and mqtt is not None:
            self._init_client()
        elif self.dry_run:
            logger.info("MQTT Publisher started in DRY-RUN mode (network calls disabled)")
        else:
            logger.warning("paho-mqtt not available; falling back to mock publishing")

    def _init_client(self) -> None:
        """Initializes and connects the Paho MQTT client."""
        try:
            # Paho MQTT v2 Client API with CallbackAPIVersion.VERSION2 if available
            if hasattr(mqtt, "CallbackAPIVersion"):
                self.client = mqtt.Client(
                    callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                    client_id="kaizen-factory-simulator",
                )
            else:
                self.client = mqtt.Client(client_id="kaizen-factory-simulator")

            def on_connect(client, userdata, flags, rc, properties=None):
                if rc == 0:
                    self.connected = True
                    logger.info(
                        "Connected to EMQX MQTT broker at %s:%d",
                        settings.mqtt_broker_host,
                        settings.mqtt_broker_port,
                    )
                else:
                    self.connected = False
                    logger.warning("MQTT connection failed with return code %d", rc)

            def on_disconnect(client, userdata, rc, properties=None):
                self.connected = False
                logger.info("Disconnected from MQTT broker (rc=%s)", rc)

            self.client.on_connect = on_connect
            self.client.on_disconnect = on_disconnect

            self.client.connect_async(
                settings.mqtt_broker_host,
                settings.mqtt_broker_port,
                keepalive=settings.mqtt_keepalive,
            )
            self.client.loop_start()
        except Exception as exc:
            logger.warning("Could not establish immediate MQTT connection: %s", exc)
            self.connected = False

    def publish_telemetry(self, items: list[MachineTelemetry]) -> None:
        """Publishes telemetry packets to machine-specific topics."""
        for item in items:
            topic = f"{settings.mqtt_base_topic}/{item.machine_id.lower()}/telemetry"
            payload = item.model_dump_json()

            if self.dry_run:
                logger.debug("[DRY-RUN] Topic: %s | Payload: %s", topic, payload)
                continue

            if self.client and self.connected:
                self.client.publish(topic, payload, qos=0)
            else:
                logger.debug("[DISCONNECTED] Topic: %s | Payload: %s", topic, payload)

    def publish_parts(self, parts: list[ConveyorPart]) -> None:
        """Publishes discrete conveyor inspection events."""
        topic = f"{settings.mqtt_base_topic}/conveyor/inspection"
        for part in parts:
            payload = part.model_dump_json()

            if self.dry_run:
                logger.debug("[DRY-RUN] Topic: %s | Payload: %s", topic, payload)
                continue

            if self.client and self.connected:
                self.client.publish(topic, payload, qos=0)
            else:
                logger.debug("[DISCONNECTED] Topic: %s | Payload: %s", topic, payload)

    def close(self) -> None:
        """Stops the network loop and disconnects the MQTT client."""
        if self.client:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception as exc:
                logger.debug("Error while stopping MQTT client: %s", exc)
        self.connected = False
