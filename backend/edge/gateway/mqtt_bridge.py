"""Gateway: Real-time industrial telemetry bridge ingesting MQTT packets from EMQX broker."""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
from typing import Any, List, Optional

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None  # type: ignore[assignment]

from backend.core.blackboard import blackboard
from backend.core.config import settings
from backend.core.models import MachineTelemetryPayload
from backend.tools.bigquery_tool import stream_sensor_telemetry

logger = logging.getLogger(__name__)


class MQTTBridge:
    """Industrial MQTT gateway bridge connecting to EMQX broker and ingesting telemetry."""

    def __init__(
        self,
        broker_host: Optional[str] = None,
        broker_port: Optional[int] = None,
        base_topic: Optional[str] = None,
        topics: Optional[List[str]] = None,
        keepalive: Optional[int] = None,
        reconnect_min_delay: Optional[float] = None,
        reconnect_max_delay: Optional[float] = None,
        dry_run: bool = False,
    ) -> None:
        self.broker_host = broker_host or settings.mqtt_broker_host
        self.broker_port = broker_port or settings.mqtt_broker_port
        self.base_topic = base_topic or settings.mqtt_base_topic
        self.keepalive = keepalive or settings.mqtt_keepalive
        self.reconnect_min_delay = reconnect_min_delay or settings.mqtt_reconnect_min_delay
        self.reconnect_max_delay = reconnect_max_delay or settings.mqtt_reconnect_max_delay
        self.dry_run = dry_run

        if topics:
            self.topics = list(topics)
        else:
            self.topics = [
                f"{self.base_topic}/motor01/telemetry",
                f"{self.base_topic}/+/telemetry",
            ]

        self.client: Optional[Any] = None
        self.is_connected = False
        self._running = False
        self.message_count = 0
        self.anomaly_count = 0

        if not self.dry_run and mqtt is not None:
            self._init_client()
        elif self.dry_run:
            logger.info("MQTTBridge initialized in DRY-RUN mode (network connection disabled)")
        else:
            logger.warning("paho-mqtt is not installed; MQTTBridge running in mock mode")

    def _init_client(self) -> None:
        """Initializes the Paho MQTT client with reconnection backoff."""
        client_id = f"kaizen-mqtt-bridge-{int(time.time())}"
        if hasattr(mqtt, "CallbackAPIVersion"):
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=client_id,
            )
        else:
            self.client = mqtt.Client(client_id=client_id)

        # Set automatic reconnection exponential backoff
        if hasattr(self.client, "reconnect_delay_set"):
            self.client.reconnect_delay_set(
                min_delay=int(self.reconnect_min_delay),
                max_delay=int(self.reconnect_max_delay),
            )

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    def _on_connect(
        self,
        client: Any,
        userdata: Any,
        flags: Any,
        rc: Any,
        properties: Optional[Any] = None,
    ) -> None:
        """Callback when connected to the broker."""
        rc_code = getattr(rc, "value", rc)
        if rc_code == 0:
            self.is_connected = True
            logger.info(
                "Connected to EMQX MQTT broker at %s:%d (WSS monitoring available on port %d)",
                self.broker_host,
                self.broker_port,
                settings.mqtt_broker_ws_port,
            )
            for topic in self.topics:
                client.subscribe(topic)
                logger.info("Subscribed to MQTT topic: %s", topic)
        else:
            self.is_connected = False
            logger.warning("MQTT connection returned code: %s", rc)

    def _on_disconnect(
        self,
        client: Any,
        userdata: Any,
        rc: Any,
        properties: Optional[Any] = None,
    ) -> None:
        """Callback when disconnected from the broker."""
        self.is_connected = False
        logger.warning(
            "Disconnected from MQTT broker (rc=%s). Auto-reconnect backoff will engage.",
            rc,
        )

    def _on_message(self, client: Any, userdata: Any, msg: Any) -> None:
        """Handles incoming MQTT messages."""
        self.process_message(msg.topic, msg.payload)

    def process_message(
        self,
        topic: str,
        payload_bytes: bytes,
    ) -> Optional[MachineTelemetryPayload]:
        """Parses, validates, and dispatches an incoming MQTT message payload."""
        try:
            payload_str = payload_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            logger.warning("Failed to decode MQTT message on %s as UTF-8: %s", topic, exc)
            return None

        try:
            telemetry = MachineTelemetryPayload.model_validate_json(payload_str)
        except Exception as exc:
            logger.warning(
                "Rejected invalid telemetry packet on %s: %s | Raw payload: %.120s",
                topic,
                exc,
                payload_str,
            )
            return None

        self.message_count += 1

        # 1. Dispatch normalized telemetry to BigQuery streaming buffer
        stream_sensor_telemetry(telemetry)

        # 2. Update Blackboard and notify when anomalous
        blackboard.record_telemetry(telemetry)
        if (
            telemetry.anomaly_score >= settings.mqtt_anomaly_threshold
            or telemetry.operating_status in ("WARNING", "ALARM")
        ):
            self.anomaly_count += 1
            logger.warning(
                "ANOMALY DETECTED on %s (%s): score=%.2f, vib=%.2f, temp=%.2f, curr=%.2f",
                telemetry.machine_id,
                telemetry.operating_status,
                telemetry.anomaly_score,
                telemetry.spindle_vibration,
                telemetry.spindle_temp,
                telemetry.motor_current,
            )

        logger.debug(
            "Ingested telemetry [%s]: %s vib=%.2f score=%.2f",
            topic,
            telemetry.machine_id,
            telemetry.spindle_vibration,
            telemetry.anomaly_score,
        )
        return telemetry

    def start(self) -> None:
        """Starts the MQTT listener asynchronously."""
        if self.dry_run or self.client is None:
            self._running = True
            logger.info("MQTTBridge started (dry-run/mock mode)")
            return

        try:
            self.client.connect_async(
                self.broker_host,
                self.broker_port,
                keepalive=self.keepalive,
            )
            self.client.loop_start()
            self._running = True
            logger.info("MQTTBridge network loop started")
        except Exception as exc:
            logger.error(
                "Failed to start MQTT connection to %s:%d: %s",
                self.broker_host,
                self.broker_port,
                exc,
            )
            self._running = False

    def stop(self) -> None:
        """Stops the MQTT client cleanly."""
        self._running = False
        if self.client:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception as exc:
                logger.debug("Error while stopping MQTT client: %s", exc)
        self.is_connected = False
        logger.info(
            "MQTTBridge stopped. Ingested %d messages (%d anomalies)",
            self.message_count,
            self.anomaly_count,
        )

    def run_forever(self) -> None:
        """Runs the bridge in the foreground until interrupted."""
        self.start()
        try:
            while self._running:
                time.sleep(0.5)
        except KeyboardInterrupt:
            logger.info("Received interrupt signal")
        finally:
            self.stop()


def main() -> None:
    """CLI entry point for running the MQTT telemetry listener."""
    parser = argparse.ArgumentParser(description="Kaizen Agent EMQX MQTT Telemetry Bridge")
    parser.add_argument("--broker", default=settings.mqtt_broker_host, help="MQTT broker host")
    parser.add_argument(
        "--port", type=int, default=settings.mqtt_broker_port, help="MQTT broker port"
    )
    parser.add_argument("--topic", default=None, help="Base MQTT topic")
    parser.add_argument("--dry-run", action="store_true", help="Run without connecting to broker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Start and stop immediately (verification)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    bridge = MQTTBridge(
        broker_host=args.broker,
        broker_port=args.port,
        base_topic=args.topic,
        dry_run=args.dry_run,
    )

    def _handle_signal(signum: int, frame: Any) -> None:
        logger.info("Received signal %d; shutting down...", signum)
        bridge.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    if args.once:
        bridge.start()
        time.sleep(1.0)
        bridge.stop()
        return

    bridge.run_forever()


if __name__ == "__main__":
    main()
