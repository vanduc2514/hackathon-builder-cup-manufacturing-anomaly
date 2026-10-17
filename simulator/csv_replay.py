"""CSV telemetry replay source.

Reads the competition MQTT sensor CSVs and emits sequential rows for the
machine simulator's replay mode. Replay is fully deterministic — there is no
RNG involved in the row order — only the synthetic anomaly_score derivation
(which is itself confined to a seeded RNG the caller passes in via the
``to_competition_payload`` method).
"""

from __future__ import annotations

import csv
import logging
import random
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Union

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# Timestamp formats the competition CSVs use. Both observed formats are
# ambiguous: ``M/D/YYYY H:MM`` (normal file, hours only) and
# ``YYYY-MM-DD HH:MM:SS`` (abnormal file, full second precision).
_TIMESTAMP_FORMATS: tuple[str, ...] = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%m/%d/%Y %H:%M",
    "%m/%d/%Y %H:%M:%S",
)


def parse_competition_timestamp(raw: str) -> datetime:
    """Parse a timestamp string from either competition CSV variant.

    Raises ``ValueError`` when no known format matches; callers can catch it to
    surface a precise error.
    """
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError("empty timestamp")
    # Try explicit formats first (fast + deterministic).
    for fmt in _TIMESTAMP_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    # Final fallback: ISO 8601 (used by ``MachineTelemetryPayload``)
    try:
        return datetime.fromisoformat(cleaned)
    except ValueError:
        pass
    raise ValueError(f"Unrecognised competition timestamp: {raw!r}")


class ReplayRow(BaseModel):
    """One normalised row of competition telemetry."""

    timestamp: datetime
    speed: float = Field(description="Spindle rotational speed (rpm)")
    temperature: float = Field(description="Spindle bearing temperature in °C")
    current_percent: float = Field(description="Motor current as % of rated current")
    load_percent: float = Field(description="Operating load percent (0-200)")
    torque_percent: float = Field(description="Torque percent (0-200)")
    overload_percent: float = Field(description="Overload percent (0-200)")
    position_error: float = Field(description="Servo position error (µm)")
    feedback_error: float = Field(description="Sensor feedback error (µm)")
    vibration: float = Field(description="Spindle vibration amplitude (mm/s)")
    fan_status: bool = Field(default=True, description="Cooling fan OK flag")
    alarm_code: Optional[int] = Field(default=None, description="Alarm code if active")
    warning_code: Optional[int] = Field(default=None, description="Warning code if active")
    operating_status: str = Field(default="RUNNING")


def _coerce_numeric(raw: Optional[str], default: float = 0.0, cast=int):
    """Convert a CSV cell to ``cast`` (default int) falling back to ``default``."""
    if raw is None or raw == "":
        return default
    try:
        return cast(raw)
    except (TypeError, ValueError):
        try:
            return cast(float(raw))
        except (TypeError, ValueError):
            return default


def _coerce_optional_int(raw: Optional[str]) -> Optional[int]:
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        try:
            return int(float(raw))
        except (TypeError, ValueError):
            return None


class CSVTelemetrySource:
    """Deterministic sequential CSV row reader for competition datasets.

    The reader is intentionally explicit and side-effect free — every call to
    :py:meth:`peek` and :py:meth:`next` advances a single integer cursor so two
    iterations of the same source will always produce identical rows in
    identical order. ``reset()`` rewinds to the start for downstream replay
    wrapping.
    """

    def __init__(self, csv_path: Union[str, Path], time_format: str = "auto") -> None:
        self.csv_path = Path(csv_path)
        if not self.csv_path.exists():
            raise FileNotFoundError(f"CSV replay source not found: {self.csv_path}")
        self.time_format = time_format
        self._rows: List[ReplayRow] = []
        self._cursor: int = 0
        self._exhausted_once: bool = False
        self._load()

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------
    def _load(self) -> None:
        with self.csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            for raw in reader:
                timestamp_raw = raw.get("timestamp", "")
                try:
                    parsed_ts = parse_competition_timestamp(timestamp_raw)
                except ValueError as exc:
                    logger.warning(
                        "Skipping row with invalid timestamp in %s: %s",
                        self.csv_path.name,
                        exc,
                    )
                    continue
                self._rows.append(
                    ReplayRow(
                        timestamp=parsed_ts,
                        speed=_coerce_numeric(raw.get("speed"), 0.0, float),
                        temperature=_coerce_numeric(raw.get("temperature"), 0.0, float),
                        current_percent=_coerce_numeric(raw.get("current_percent"), 0.0, float),
                        load_percent=_coerce_numeric(raw.get("load_percent"), 0.0, float),
                        torque_percent=_coerce_numeric(raw.get("torque_percent"), 0.0, float),
                        overload_percent=_coerce_numeric(raw.get("overload_percent"), 0.0, float),
                        position_error=_coerce_numeric(raw.get("position_error"), 0.0, float),
                        feedback_error=_coerce_numeric(raw.get("feedback_error"), 0.0, float),
                        vibration=_coerce_numeric(raw.get("vibration"), 0.0, float),
                        fan_status=str(raw.get("fan_status", "true")).lower()
                        in ("true", "1", "yes"),
                        alarm_code=_coerce_optional_int(raw.get("alarm_code")),
                        warning_code=_coerce_optional_int(raw.get("warning_code")),
                        operating_status=(raw.get("operating_status") or "RUNNING").strip(),
                    )
                )
        if not self._rows:
            raise ValueError(f"CSV replay source is empty after parsing: {self.csv_path}")

    # ------------------------------------------------------------------
    # Cursor API
    # ------------------------------------------------------------------
    def __len__(self) -> int:
        return len(self._rows)

    def __iter__(self) -> Iterator[ReplayRow]:
        return iter(self._rows)

    @property
    def cursor(self) -> int:
        return self._cursor

    @property
    def exhausted(self) -> bool:
        return self._exhausted_once

    def reset(self) -> None:
        self._cursor = 0
        self._exhausted_once = False

    def peek(self) -> Optional[ReplayRow]:
        if not self._rows:
            return None
        return self._rows[self._cursor % len(self._rows)]

    def next(self) -> Optional[ReplayRow]:
        if not self._rows:
            return None
        if self._cursor >= len(self._rows):
            self._exhausted_once = True
            return None
        row = self._rows[self._cursor]
        self._cursor += 1
        if self._cursor >= len(self._rows):
            self._exhausted_once = True
        return row

    # ------------------------------------------------------------------
    # Mapping
    # ------------------------------------------------------------------
    def to_competition_payload(
        self,
        row: ReplayRow,
        rng: Optional[random.Random] = None,
        row_index: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Map a :class:`ReplayRow` to the nested competition JSON envelope.

        Field-by-field reference (CSV → nested JSON path):

        - ``speed`` → ``sensor.rpm.value``
        - ``temperature`` → ``sensor.temperature.value``
        - ``current_percent * 0.123`` → ``sensor.current.value``
          (12.3 A baseline when ``current_percent == 100``)
        - ``vibration`` → ``sensor.vibration.value``
        - ``load_percent`` → ``operating.load_percent``
        - ``operating_status`` ``RUNNING`` → ``health.status = NORMAL``;
          ``FAULT``/``ALARM``/anything else → ``ANOMALY``
        - ``alarm_code`` empty → ``health.anomaly_score = 0.02 + uniform(0, 0.06)``
        - ``alarm_code`` non-empty → ``health.anomaly_score = 0.65 + min(alarm_code/100, 0.33)``

        ``runtime_hours`` is derived from the row index as
        ``1200 + row_index // 60``; if no index is supplied it falls back to the
        current cursor position so a wrapped-around replay reads sensibly.
        """
        if rng is None:
            rng = random.Random(0)
        if row_index is None:
            row_index = max(self._cursor - 1, 0)

        # --- health --------------------------------------------------------------
        if row.alarm_code is None:
            anomaly_score = round(0.02 + rng.uniform(0.0, 0.06), 3)
        else:
            anomaly_score = round(0.65 + min(row.alarm_code / 100.0, 0.33), 3)
        health_status = "NORMAL" if row.operating_status == "RUNNING" else "ANOMALY"

        # --- asset ---------------------------------------------------------------
        machine_label = "MOTOR_01"

        timestamp_iso = row.timestamp.isoformat()
        # ISO with trailing Z to satisfy broker conventions.
        if not timestamp_iso.endswith("Z"):
            timestamp_iso = f"{timestamp_iso}Z"

        runtime_hours = 1200 + (row_index // 60)

        return {
            "timestamp": timestamp_iso,
            "asset": {
                "factory_id": "FACTORY_01",
                "line_id": "LINE_01",
                "machine_id": machine_label,
                "machine_type": "INDUCTION_MOTOR",
            },
            "operating": {
                "status": row.operating_status,
                "load_percent": float(row.load_percent),
                "runtime_hours": runtime_hours,
            },
            "sensor": {
                "temperature": {
                    "value": float(row.temperature),
                    "unit": "C",
                },
                "vibration": {
                    "value": float(row.vibration),
                    "unit": "mm/s",
                },
                "rpm": {
                    "value": int(round(row.speed)),
                    "unit": "rpm",
                },
                "current": {
                    "value": round(row.current_percent * 0.123, 3),
                    "unit": "A",
                },
            },
            "health": {
                "status": health_status,
                "anomaly_score": anomaly_score,
            },
        }
