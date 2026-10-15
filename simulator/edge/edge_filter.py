"""Gateway: On-prem filter sending only defective product frames and anomalous signals to Google Cloud."""

from __future__ import annotations

import collections
import hashlib
import inspect as py_inspect
import logging
from typing import Any, Callable, Deque, List, Optional, Tuple

from simulator.edge.gemma_classifier import GemmaEdgeClassifier
from simulator.models import (
    EdgeClassificationResult,
    EdgeFilterStatistics,
    FilteredFramePacket,
)

logger = logging.getLogger(__name__)

# Constants
DEFAULT_CONFIDENCE_THRESHOLD = 0.85
DEFAULT_PASS_DROP_RATIO = 0.95
ESTIMATED_FRAME_SIZE_BYTES = 512 * 1024  # 512 KB average uncompressed raw camera frame
MAX_SPOOL_SIZE = 500


def compute_frame_hash(
    camera_id: str,
    conveyor_timestamp: str,
    product_id: str,
    machine_id: str,
    tool_id: str,
    image_token: Optional[str] = None,
    image_bytes_b64: Optional[str] = None,
) -> str:
    """Generates deterministic SHA-256 hash guaranteeing provenance and metrology audit trail."""
    hasher = hashlib.sha256()
    payload = (
        f"{camera_id}:{conveyor_timestamp}:{product_id}:{machine_id}:"
        f"{tool_id}:{image_token or ''}:{image_bytes_b64 or ''}"
    )
    hasher.update(payload.encode("utf-8"))
    return hasher.hexdigest()


class EdgeAlertSpool:
    """Local ring-buffer spool storing up to 500 packets during offline operation or network drops."""

    def __init__(self, maxsize: int = MAX_SPOOL_SIZE) -> None:
        self.maxsize = maxsize
        self._spool: Deque[FilteredFramePacket] = collections.deque(maxlen=maxsize)

    def append(self, packet: FilteredFramePacket) -> None:
        """Stores forwarded packet in local spool buffer."""
        self._spool.append(packet)

    def drain(self, count: Optional[int] = None) -> List[FilteredFramePacket]:
        """Pulls and removes queued packets from the spool."""
        packets: List[FilteredFramePacket] = []
        limit = count if count is not None else len(self._spool)
        for _ in range(min(limit, len(self._spool))):
            packets.append(self._spool.popleft())
        return packets

    def peek(self) -> List[FilteredFramePacket]:
        """Returns copies of all currently spooled packets without removing them."""
        return list(self._spool)

    def __len__(self) -> int:
        return len(self._spool)

    def clear(self) -> None:
        self._spool.clear()


class EdgeNoiseFilter:
    """Discards 95%+ of normal PASS frames on-premises, forwarding only anomalies to Google Cloud."""

    def __init__(
        self,
        pass_drop_ratio: float = DEFAULT_PASS_DROP_RATIO,
        confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
        allow_audit_sampling: bool = False,
        camera_id: str = "CAM-LINE01-EOL",
    ) -> None:
        self.pass_drop_ratio = max(0.0, min(1.0, pass_drop_ratio))
        self.confidence_threshold = confidence_threshold
        self.allow_audit_sampling = allow_audit_sampling
        self.camera_id = camera_id

        # Metrics counters
        self.total_frames_evaluated: int = 0
        self.pass_frames_dropped: int = 0
        self.defect_frames_forwarded: int = 0
        self.uncertain_frames_forwarded: int = 0
        self.audit_sampled_forwarded: int = 0
        self._pass_counter: int = 0

    def evaluate_frame(
        self,
        frame: Any,
        classification: EdgeClassificationResult,
    ) -> FilteredFramePacket:
        """Applies drop policy and tags frame with metrology metadata and cryptographic hash."""
        self.total_frames_evaluated += 1

        product_id = getattr(frame, "product_id", None) or (
            frame.get("product_id") if isinstance(frame, dict) else "PRD-UNKNOWN"
        )
        timestamp = (
            getattr(frame, "timestamp", None)
            or (frame.get("timestamp") if isinstance(frame, dict) else None)
            or "1970-01-01T00:00:00Z"
        )
        machine_id = getattr(frame, "machine_id", None) or (
            frame.get("machine_id") if isinstance(frame, dict) else "CNC-02"
        )
        tool_id = getattr(frame, "tool_id", None) or (
            frame.get("tool_id") if isinstance(frame, dict) else "T07"
        )
        lot_id = getattr(frame, "lot_id", None) or (
            frame.get("lot_id") if isinstance(frame, dict) else "AL-5083-B4"
        )
        image_token = getattr(frame, "image_token", None) or (
            frame.get("image_token") if isinstance(frame, dict) else None
        )
        cavity_id = getattr(frame, "cavity_id", None) or (
            frame.get("cavity_id") if isinstance(frame, dict) else None
        )
        camera_id = getattr(frame, "camera_id", None) or self.camera_id

        frame_hash = compute_frame_hash(
            camera_id=camera_id,
            conveyor_timestamp=timestamp,
            product_id=product_id,
            machine_id=machine_id,
            tool_id=tool_id,
            image_token=image_token,
        )

        filter_decision = "DROP"
        classification_label = "PASS"

        if classification.is_defect:
            filter_decision = "FORWARD"
            classification_label = "DEFECT"
            self.defect_frames_forwarded += 1
        elif classification.confidence < self.confidence_threshold or classification.uncertainty > (
            1.0 - self.confidence_threshold
        ):
            # High-uncertainty frames must be reviewed by cloud Quality Inspector
            filter_decision = "FORWARD"
            classification_label = "UNCERTAIN"
            self.uncertain_frames_forwarded += 1
        else:
            # Normal product PASS frame
            self._pass_counter += 1
            if self.allow_audit_sampling and self.pass_drop_ratio < 1.0:
                sample_interval = max(1, int(round(1.0 / (1.0 - self.pass_drop_ratio))))
                if self._pass_counter % sample_interval == 0:
                    filter_decision = "FORWARD"
                    classification_label = "PASS"
                    self.audit_sampled_forwarded += 1
                else:
                    filter_decision = "DROP"
                    self.pass_frames_dropped += 1
            else:
                # Default: 95% to 100% of PASS frames dropped locally
                if self.pass_drop_ratio >= 1.0:
                    filter_decision = "DROP"
                    self.pass_frames_dropped += 1
                else:
                    # Deterministic modulo rate
                    sample_interval = max(1, int(round(1.0 / (1.0 - self.pass_drop_ratio))))
                    if self._pass_counter % sample_interval == 0 and self._pass_counter > 0:
                        filter_decision = "FORWARD"
                        self.audit_sampled_forwarded += 1
                    else:
                        filter_decision = "DROP"
                        self.pass_frames_dropped += 1

        return FilteredFramePacket(
            frame_hash=frame_hash,
            camera_id=camera_id,
            product_id=product_id,
            machine_id=machine_id,
            tool_id=tool_id,
            lot_id=lot_id,
            conveyor_timestamp=timestamp,
            classification=classification_label,
            is_defect=classification.is_defect,
            defect_type=classification.defect_type,
            confidence=classification.confidence,
            uncertainty=classification.uncertainty,
            bounding_box=classification.bounding_box,
            filter_decision=filter_decision,
            diverter_actuated=classification.diverter_actuated,
            image_token=image_token,
            cavity_id=cavity_id,
            metadata={
                "model_name": classification.model_name,
                "inference_time_ms": classification.inference_time_ms,
                "operating_mode": classification.operating_mode,
            },
        )

    def get_statistics(self) -> EdgeFilterStatistics:
        """Calculates current noise filtering and cloud bandwidth reduction ratios."""
        total_forwarded = (
            self.defect_frames_forwarded
            + self.uncertain_frames_forwarded
            + self.audit_sampled_forwarded
        )
        drop_ratio = (
            self.pass_frames_dropped / self.total_frames_evaluated
            if self.total_frames_evaluated > 0
            else 0.0
        )
        bandwidth_reduction = drop_ratio * 100.0
        saved_bytes = self.pass_frames_dropped * ESTIMATED_FRAME_SIZE_BYTES
        saved_mb = saved_bytes / (1024.0 * 1024.0)

        return EdgeFilterStatistics(
            total_frames_evaluated=self.total_frames_evaluated,
            pass_frames_dropped=self.pass_frames_dropped,
            defect_frames_forwarded=self.defect_frames_forwarded,
            uncertain_frames_forwarded=self.uncertain_frames_forwarded,
            audit_sampled_forwarded=self.audit_sampled_forwarded,
            total_frames_forwarded=total_forwarded,
            drop_ratio=round(drop_ratio, 4),
            cloud_bandwidth_reduction_pct=round(bandwidth_reduction, 2),
            estimated_bandwidth_saved_mb=round(saved_mb, 2),
        )

    def reset_statistics(self) -> None:
        """Resets all metrics counters."""
        self.total_frames_evaluated = 0
        self.pass_frames_dropped = 0
        self.defect_frames_forwarded = 0
        self.uncertain_frames_forwarded = 0
        self.audit_sampled_forwarded = 0
        self._pass_counter = 0


class EdgeInspectionStation:
    """Integrated on-premise inspection pipeline combining classifier, filter, and spool."""

    def __init__(
        self,
        classifier: Optional[GemmaEdgeClassifier] = None,
        edge_filter: Optional[EdgeNoiseFilter] = None,
        spool: Optional[EdgeAlertSpool] = None,
        forward_handler: Optional[Callable[[FilteredFramePacket], None]] = None,
    ) -> None:
        self.classifier = classifier or GemmaEdgeClassifier()
        self.edge_filter = edge_filter or EdgeNoiseFilter()
        self.spool = spool or EdgeAlertSpool()
        self.forward_handler = forward_handler

    async def inspect(self, frame: Any) -> Tuple[EdgeClassificationResult, FilteredFramePacket]:
        """Runs end-to-end edge inference, noise filtering, metrology tagging, and spooling."""
        classification = await self.classifier.classify_frame(frame)
        packet = self.edge_filter.evaluate_frame(frame, classification)

        if packet.filter_decision == "FORWARD":
            self.spool.append(packet)
            if self.forward_handler:
                try:
                    res = self.forward_handler(packet)
                    if py_inspect.iscoroutine(res):
                        await res
                except Exception as exc:
                    logger.warning("Forward handler raised exception: %s", exc)

        return classification, packet

    async def process_part(self, frame: Any) -> Optional[FilteredFramePacket]:
        """Convenience method returning packet only if forwarded to cloud (None if dropped)."""
        _, packet = await self.inspect(frame)
        return packet if packet.filter_decision == "FORWARD" else None

    async def process_batch(self, frames: List[Any]) -> List[FilteredFramePacket]:
        """Processes a list of inspection frames, returning only the forwarded packets."""
        forwarded: List[FilteredFramePacket] = []
        for f in frames:
            pkt = await self.process_part(f)
            if pkt is not None:
                forwarded.append(pkt)
        return forwarded

    async def aclose(self) -> None:
        """Closes resources associated with the inspection station."""
        await self.classifier.aclose()

    def close(self) -> None:
        """Closes resources associated with the inspection station synchronously."""
        self.classifier.close()
