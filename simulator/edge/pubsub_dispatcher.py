"""Pub/Sub Dispatcher: Outbound event publisher for simulator and edge gateway with offline fallback."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional, Union

from simulator.config import settings
from simulator.models import (
    FilteredFramePacket,
    MachineTelemetry,
    MachineTelemetryPayload,
    QualityEventPayload,
    TraceabilityEventPayload,
)

logger = logging.getLogger(__name__)


class EdgePubSubDispatcher:
    """Dispatches edge quality events, telemetry, and traceability payloads to Google Cloud Pub/Sub."""

    def __init__(
        self,
        project_id: Optional[str] = None,
        emulator_host: Optional[str] = None,
        dry_run: Optional[bool] = None,
    ) -> None:
        self.project_id = project_id or settings.gcp_project_id
        self.emulator_host = (
            emulator_host or settings.pubsub_emulator_host or os.getenv("PUBSUB_EMULATOR_HOST")
        )
        if dry_run is not None:
            self.dry_run = dry_run
        elif self.emulator_host:
            self.dry_run = False
        else:
            self.dry_run = not settings.pubsub_enabled
        self._publisher: Any = None
        self._published_events: List[Dict[str, Any]] = []

    @property
    def is_emulator(self) -> bool:
        return bool(self.emulator_host)

    def _get_publisher(self) -> Any:
        if self._publisher is not None:
            return self._publisher

        if self.dry_run:
            return None

        try:
            from google.auth.credentials import AnonymousCredentials
            from google.cloud import pubsub_v1

            if self.emulator_host:
                os.environ["PUBSUB_EMULATOR_HOST"] = self.emulator_host
                self._publisher = pubsub_v1.PublisherClient(credentials=AnonymousCredentials())
            else:
                self._publisher = pubsub_v1.PublisherClient()
            return self._publisher
        except Exception as exc:
            logger.debug(
                "Pub/Sub client unavailable (%s); using in-memory offline fallback buffer", exc
            )
            return None

    async def _publish(
        self, topic_name: str, payload_bytes: bytes, raw_dict: Dict[str, Any]
    ) -> bool:
        publisher = self._get_publisher()
        event_record = {"topic": topic_name, "payload": raw_dict}

        if publisher is None:
            logger.debug("Pub/Sub offline/dry-run: recorded event for topic %s", topic_name)
            self._published_events.append(event_record)
            return True

        topic_path = f"projects/{self.project_id}/topics/{topic_name}"

        def _sync_publish() -> None:
            future = publisher.publish(topic_path, payload_bytes)
            future.result(timeout=5.0)

        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _sync_publish)
            self._published_events.append(event_record)
            return True
        except Exception as exc:
            logger.warning(
                "Pub/Sub publish failed for topic %s: %s. Storing in local fallback buffer.",
                topic_name,
                exc,
            )
            event_record["error"] = str(exc)
            self._published_events.append(event_record)
            return False

    async def publish_quality_event(
        self, event: QualityEventPayload, topic_name: Optional[str] = None
    ) -> bool:
        """Publishes a QualityEventPayload to kaizen-quality-events topic."""
        topic = topic_name or settings.pubsub_quality_events_topic
        payload_data = event.model_dump_json().encode("utf-8")
        return await self._publish(topic, payload_data, event.model_dump())

    async def publish_telemetry(
        self,
        telemetry: Union[MachineTelemetry, MachineTelemetryPayload],
        topic_name: Optional[str] = None,
    ) -> bool:
        """Publishes a MachineTelemetryPayload to kaizen-telemetry topic."""
        topic = topic_name or settings.pubsub_telemetry_topic
        if isinstance(telemetry, MachineTelemetry):
            payload = MachineTelemetryPayload(
                machine_id=telemetry.machine_id,
                timestamp=telemetry.timestamp,
                tool_id=telemetry.tool_id,
                spindle_vibration=telemetry.spindle_vibration,
                motor_current=telemetry.motor_current,
                spindle_temp=telemetry.spindle_temp,
                rpm=telemetry.rpm,
                operating_status=telemetry.operating_status,
                dryer_dew_point=telemetry.dryer_dew_point,
            )
        else:
            payload = telemetry
        payload_data = payload.model_dump_json().encode("utf-8")
        return await self._publish(topic, payload_data, payload.model_dump())

    async def publish_traceability(
        self, traceability: TraceabilityEventPayload, topic_name: Optional[str] = None
    ) -> bool:
        """Publishes a TraceabilityEventPayload to kaizen-traceability topic."""
        topic = topic_name or settings.pubsub_traceability_topic
        payload_data = traceability.model_dump_json().encode("utf-8")
        return await self._publish(topic, payload_data, traceability.model_dump())

    async def dispatch_anomaly(
        self,
        packet: FilteredFramePacket,
        scenario: str = "cnc_tool_wear",
        mode: str = "demo",
        telemetry: Optional[Union[MachineTelemetry, MachineTelemetryPayload]] = None,
    ) -> Dict[str, bool]:
        """Dispatches structured payloads across quality-events, traceability, and telemetry topics."""
        results: Dict[str, bool] = {}

        # 1. Quality Event
        quality_evt = QualityEventPayload(
            machine_id=packet.machine_id,
            tool_id=packet.tool_id,
            defect_type=packet.defect_type or "scratch_vertical",
            scenario=scenario,
            mode=mode,
            severity="high" if packet.confidence >= 0.90 else "medium",
            filtered_frame=packet,
        )
        results["quality_event"] = await self.publish_quality_event(quality_evt)

        # 2. Traceability Event
        traceability_evt = TraceabilityEventPayload(
            product_id=packet.product_id,
            timestamp=packet.conveyor_timestamp,
            machine_id=packet.machine_id,
            tool_id=packet.tool_id,
            lot_id=packet.lot_id,
            status="DEFECT" if packet.is_defect else "PASS",
        )
        results["traceability"] = await self.publish_traceability(traceability_evt)

        # 3. Telemetry Event (if provided)
        if telemetry is not None:
            results["telemetry"] = await self.publish_telemetry(telemetry)

        return results

    def get_published_events(self) -> List[Dict[str, Any]]:
        """Returns recorded events from in-memory fallback or tracking buffer."""
        return list(self._published_events)

    def clear_published_events(self) -> None:
        """Clears in-memory buffer."""
        self._published_events.clear()

    def close(self) -> None:
        """Closes publisher client connection."""
        if self._publisher is not None:
            try:
                transport = getattr(self._publisher, "transport", None)
                if transport and hasattr(transport, "close"):
                    transport.close()
            except Exception as exc:
                logger.debug("Error closing publisher transport: %s", exc)
        self._publisher = None
