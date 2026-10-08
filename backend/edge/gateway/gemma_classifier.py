"""Gateway: Local Gemma 3 pass/fail inference, edge vision classification, and metrology tagging."""

from __future__ import annotations

import json
import logging
import time
from enum import Enum
from typing import Any, Dict, Optional, Union

import httpx

from backend.core.models import BoundingBox, EdgeClassificationResult

logger = logging.getLogger(__name__)


class EdgeClassifierMode(str, Enum):
    """Operational mode for edge vision inference."""

    OLLAMA = "ollama"
    HEURISTIC = "heuristic"
    DATASET_PLAYBACK = "dataset_playback"


class GemmaEdgeClassifier:
    """Simulates an on-premise edge IPC running lightweight Gemma 3 vision inference."""

    def __init__(
        self,
        mode: Union[EdgeClassifierMode, str] = EdgeClassifierMode.HEURISTIC,
        ollama_url: str = "http://localhost:11434",
        model_name: str = "gemma:2b",
        confidence_threshold: float = 0.85,
        timeout_seconds: float = 2.0,
    ) -> None:
        if isinstance(mode, str):
            try:
                self.mode = EdgeClassifierMode(mode.lower())
            except ValueError:
                logger.warning("Unknown mode '%s', falling back to HEURISTIC", mode)
                self.mode = EdgeClassifierMode.HEURISTIC
        else:
            self.mode = mode

        self.ollama_url = ollama_url.rstrip("/")
        self.model_name = model_name
        self.confidence_threshold = confidence_threshold
        self.timeout_seconds = timeout_seconds

        # Prior bounding boxes for known manufacturing defect signatures (normalized 0.0-1.0)
        self._defect_bbox_priors: Dict[str, BoundingBox] = {
            "scratch_vertical": BoundingBox(ymin=0.25, xmin=0.48, ymax=0.75, xmax=0.52),
            "scratch": BoundingBox(ymin=0.20, xmin=0.45, ymax=0.70, xmax=0.55),
            "short_fill": BoundingBox(ymin=0.10, xmin=0.10, ymax=0.40, xmax=0.45),
            "sink_mark": BoundingBox(ymin=0.40, xmin=0.40, ymax=0.60, xmax=0.60),
            "minor_burr": BoundingBox(ymin=0.85, xmin=0.70, ymax=0.95, xmax=0.85),
            "burr": BoundingBox(ymin=0.85, xmin=0.70, ymax=0.95, xmax=0.85),
            "misalignment": BoundingBox(ymin=0.15, xmin=0.15, ymax=0.85, xmax=0.85),
        }

    def _get_default_bbox(self, defect_type: Optional[str]) -> Optional[BoundingBox]:
        """Returns standard metrology bounding box coordinates for a defect signature."""
        if not defect_type:
            return None
        norm_key = defect_type.lower().strip()
        return self._defect_bbox_priors.get(
            norm_key,
            BoundingBox(ymin=0.30, xmin=0.30, ymax=0.70, xmax=0.70),
        )

    def classify_frame(self, frame: Any) -> EdgeClassificationResult:
        """Evaluates an inspection frame and outputs pass/fail status and metrology bounding box."""
        start_time = time.perf_counter()

        # Extract normalized attributes across InspectionFrame, ConveyorPart, or dict
        product_id = getattr(frame, "product_id", None) or (
            frame.get("product_id") if isinstance(frame, dict) else "PRD-UNKNOWN"
        )
        machine_id = getattr(frame, "machine_id", None) or (
            frame.get("machine_id") if isinstance(frame, dict) else "CNC-02"
        )
        tool_id = getattr(frame, "tool_id", None) or (
            frame.get("tool_id") if isinstance(frame, dict) else "T07"
        )
        image_token = getattr(frame, "image_token", None) or (
            frame.get("image_token") if isinstance(frame, dict) else None
        )
        status = getattr(frame, "status", None) or (
            frame.get("status") if isinstance(frame, dict) else "PASS"
        )
        defect_type = getattr(frame, "defect_type", None) or (
            frame.get("defect_type") if isinstance(frame, dict) else None
        )
        cavity_id = getattr(frame, "cavity_id", None) or (
            frame.get("cavity_id") if isinstance(frame, dict) else None
        )

        operating_mode_str = self.mode.value
        raw_explanation: Optional[str] = None

        if self.mode == EdgeClassifierMode.OLLAMA:
            result = self._classify_ollama(
                product_id=product_id,
                machine_id=machine_id,
                tool_id=tool_id,
                image_token=image_token,
                status=status,
                defect_type=defect_type,
            )
            is_defect = result["is_defect"]
            det_defect_type = result["defect_type"]
            confidence = result["confidence"]
            bbox = result["bounding_box"]
            operating_mode_str = result.get("operating_mode", self.mode.value)
            raw_explanation = result.get("raw_explanation")
        elif self.mode == EdgeClassifierMode.DATASET_PLAYBACK:
            result = self._classify_dataset_playback(
                image_token=image_token,
                status=status,
                defect_type=defect_type,
                machine_id=machine_id,
                cavity_id=cavity_id,
            )
            is_defect = result["is_defect"]
            det_defect_type = result["defect_type"]
            confidence = result["confidence"]
            bbox = result["bounding_box"]
        else:
            result = self._classify_heuristic(
                status=status,
                defect_type=defect_type,
                image_token=image_token,
                machine_id=machine_id,
                cavity_id=cavity_id,
            )
            is_defect = result["is_defect"]
            det_defect_type = result["defect_type"]
            confidence = result["confidence"]
            bbox = result["bounding_box"]

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        # Simulated edge inference sub-50ms constraint
        if round(elapsed_ms, 2) == 0.0:
            elapsed_ms = 12.5

        uncertainty = max(0.0, min(1.0, 1.0 - confidence))
        # Pneumatic scrap diverter actuates immediately when defect or high uncertainty is flagged
        diverter_actuated = is_defect or (uncertainty > (1.0 - self.confidence_threshold))

        return EdgeClassificationResult(
            is_defect=is_defect,
            defect_type=det_defect_type,
            confidence=round(confidence, 4),
            uncertainty=round(uncertainty, 4),
            bounding_box=bbox,
            inference_time_ms=round(elapsed_ms, 2),
            model_name=self.model_name
            if self.mode == EdgeClassifierMode.OLLAMA
            else "gemma-3-2b-edge",
            operating_mode=operating_mode_str,
            diverter_actuated=diverter_actuated,
            raw_explanation=raw_explanation,
        )

    def _classify_dataset_playback(
        self,
        image_token: Optional[str],
        status: str,
        defect_type: Optional[str],
        machine_id: str,
        cavity_id: Optional[int],
    ) -> Dict[str, Any]:
        """Resolves classification by parsing MVTec AD dataset paths and inspection tokens."""
        token_str = (image_token or "").lower()

        if "scratch" in token_str or "scratch_vertical" in token_str:
            d_type = "scratch_vertical"
            return {
                "is_defect": True,
                "defect_type": d_type,
                "confidence": 0.96,
                "bounding_box": self._get_default_bbox(d_type),
            }
        if "short_fill" in token_str or (cavity_id == 3 and "short" in token_str):
            d_type = "short_fill"
            return {
                "is_defect": True,
                "defect_type": d_type,
                "confidence": 0.94,
                "bounding_box": self._get_default_bbox(d_type),
            }
        if "sink_mark" in token_str:
            d_type = "sink_mark"
            return {
                "is_defect": True,
                "defect_type": d_type,
                "confidence": 0.93,
                "bounding_box": self._get_default_bbox(d_type),
            }
        if "burr" in token_str:
            d_type = "minor_burr"
            return {
                "is_defect": True,
                "defect_type": d_type,
                "confidence": 0.89,
                "bounding_box": self._get_default_bbox(d_type),
            }
        if "good" in token_str or "pass" in token_str:
            return {
                "is_defect": False,
                "defect_type": None,
                "confidence": 0.99,
                "bounding_box": None,
            }

        # Fallback to heuristic if token doesn't match standard MVTec AD paths
        return self._classify_heuristic(status, defect_type, image_token, machine_id, cavity_id)

    def _classify_heuristic(
        self,
        status: Optional[str],
        defect_type: Optional[str],
        image_token: Optional[str],
        machine_id: str,
        cavity_id: Optional[int],
    ) -> Dict[str, Any]:
        """Deterministic heuristic classifier for local development, tests, and mock mode."""
        is_defect = False
        resolved_defect_type: Optional[str] = defect_type
        confidence = 0.99

        if defect_type:
            is_defect = True
            confidence = 0.96
        elif status and status != "PASS":
            is_defect = True
            if not resolved_defect_type:
                if status == "DEFECT_SCRATCH":
                    resolved_defect_type = "scratch_vertical"
                elif status == "DEFECT_SHORT_FILL":
                    resolved_defect_type = "short_fill"
                elif status == "DEFECT_SINK_MARK":
                    resolved_defect_type = "sink_mark"
                else:
                    resolved_defect_type = status.lower().replace("defect_", "")
            confidence = 0.96
        elif cavity_id == 3 and machine_id == "IM-05":
            # Potential mold cavity defect signature
            is_defect = True
            resolved_defect_type = "short_fill"
            confidence = 0.92

        bbox = self._get_default_bbox(resolved_defect_type) if is_defect else None

        return {
            "is_defect": is_defect,
            "defect_type": resolved_defect_type,
            "confidence": confidence,
            "bounding_box": bbox,
        }

    def _classify_ollama(
        self,
        product_id: str,
        machine_id: str,
        tool_id: str,
        image_token: Optional[str],
        status: str,
        defect_type: Optional[str],
    ) -> Dict[str, Any]:
        """Queries local Ollama endpoint running gemma:2b for pass/fail classification."""
        prompt = (
            f"You are an industrial edge optical inspection classifier running on an edge IPC.\n"
            f"Evaluate product: id={product_id}, machine={machine_id}, tool={tool_id}, "
            f"frame_token={image_token or 'none'}.\n"
            f'Return JSON strictly with format: {{"is_defect": bool, "defect_type": string or null, '
            f'"confidence": float (0.0 to 1.0), "bounding_box": [ymin, xmin, ymax, xmax] or null}}.'
        )

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                resp = client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model_name,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json",
                    },
                )
            if resp.status_code == 200:
                data = resp.json()
                raw_text = data.get("response", "{}")
                parsed = json.loads(raw_text)
                is_defect = bool(parsed.get("is_defect", False))
                d_type = parsed.get("defect_type")
                conf = float(parsed.get("confidence", 0.90))

                raw_box = parsed.get("bounding_box")
                bbox: Optional[BoundingBox] = None
                if raw_box and isinstance(raw_box, (list, tuple)) and len(raw_box) == 4:
                    bbox = BoundingBox(
                        ymin=float(raw_box[0]),
                        xmin=float(raw_box[1]),
                        ymax=float(raw_box[2]),
                        xmax=float(raw_box[3]),
                    )
                elif is_defect:
                    bbox = self._get_default_bbox(d_type)

                return {
                    "is_defect": is_defect,
                    "defect_type": d_type,
                    "confidence": max(0.0, min(1.0, conf)),
                    "bounding_box": bbox,
                    "operating_mode": EdgeClassifierMode.OLLAMA.value,
                    "raw_explanation": raw_text,
                }
        except Exception as exc:
            logger.debug(
                "Ollama endpoint at %s unavailable or failed (%s). Falling back to heuristic.",
                self.ollama_url,
                exc,
            )

        # Environment parity: Gracefully fall back to heuristic mock classification
        fallback_res = self._classify_heuristic(status, defect_type, image_token, machine_id, None)
        fallback_res["operating_mode"] = "heuristic_fallback"
        return fallback_res
