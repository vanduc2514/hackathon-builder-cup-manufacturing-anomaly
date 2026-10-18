"""Verify the cnc02 preset images against real Gemini Vision (3 raw calls per image).

Usage: ``mise exec -- python scripts/verify_vision_presets.py``. Uses
``settings.gemini_vision_model`` (override with ``GEMINI_VISION_MODEL``). Calls the RAW
``inspect_*`` functions (no DEMO_SCRIPTED guard) and reports whether all runs match the
catalog ``expected_class``. Costs 3 real Gemini calls per image.
"""

from __future__ import annotations

import logging
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.config import settings  # noqa: E402
from backend.tools.gemini_vision_tool import (  # noqa: E402
    inspect_insert_image,
    inspect_part_image,
    normalize_image,
)
from backend.tools.preset_catalog import list_presets, load_preset_image  # noqa: E402

logger = logging.getLogger(__name__)

RUNS = 3
ROLES = ("qa_defect", "streak_good", "tool_worn", "tool_new")


def _label(role: str, image: bytes, machine_id: str, tool_id: str) -> str:
    if role in ("qa_defect", "streak_good"):
        return inspect_part_image(image, machine_id=machine_id, tool_id=tool_id).defect_class
    result = inspect_insert_image(image, machine_id=machine_id, tool_id=tool_id)
    return "replace" if result.replace_insert else "ok"


def main() -> int:
    logging.basicConfig(level=logging.WARNING)
    print(f"model={settings.gemini_vision_model} runs={RUNS}")
    mismatches = 0
    for role in ROLES:
        for preset in list_presets(role):
            image = normalize_image(load_preset_image(preset))
            labels: list[str] = []
            for _ in range(RUNS):
                try:
                    labels.append(_label(role, image, preset.machine_id, preset.tool_id or "T07"))
                except Exception as exc:  # report, keep going
                    labels.append(f"ERROR({type(exc).__name__})")
            ok = all(label == preset.expected_class for label in labels)
            mismatches += 0 if ok else 1
            print(
                f"{'OK  ' if ok else 'FAIL'} {role:11} expected={preset.expected_class:16} "
                f"got={dict(Counter(labels))} {preset.image_file}"
            )
    print(f"all_match={mismatches == 0} failing_images={mismatches}")
    return 0 if mismatches == 0 else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
