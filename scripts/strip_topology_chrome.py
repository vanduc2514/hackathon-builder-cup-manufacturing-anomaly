#!/usr/bin/env python3
"""Strip the Sidebar + Top Header chrome from the System Topology Stitch HTML
and emit the standalone demo at `apps/demo/index.html`.

The Plant Ops dashboard (`apps/web`) no longer ships the System Topology view
since the topology was moved to a standalone demo deployed on
`kaizen-lab-demo.web.app` (Firebase Hosting target `demo`). This script keeps
`apps/demo/index.html` reproducible from the canonical Stitch source at
`.stitch/designs/system_topology_workflow.html`.

Usage:
    python scripts/strip_topology_chrome.py

Run this whenever `.stitch/designs/system_topology_workflow.html` is updated.
The script writes `apps/demo/index.html` (creating `apps/demo/` if needed).

Idempotent: running twice produces a no-op (the second run finds nothing to
strip because the output is already chrome-free).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE = REPO_ROOT / ".stitch" / "designs" / "system_topology_workflow.html"
TARGET = REPO_ROOT / "apps" / "demo" / "index.html"

CSS_RULES_TO_DROP = [
    ".sidebar",
    ".brand-row",
    ".brand-tile",
    ".brand-name",
    ".nav-section",
    ".nav-heading",
    ".nav-item",
    ".nav-item:hover",
    ".nav-item.active",
    ".nav-item.active .material-symbols-outlined",
    ".sidebar-footer",
    ".top-header",
    ".top-header-left",
    ".header-crumb",
]

APP_LAYOUT_REPLACEMENT = (
    ".app-layout {\n"
    "  position: relative;\n"
    "  z-index: 1;\n"
    "  display: flex;\n"
    "  min-height: 100vh;\n"
    "  padding: 12px;\n"
    "}"
)

APP_LAYOUT_ORIGINAL = (
    ".app-layout {\n"
    "  position: relative;\n"
    "  z-index: 1;\n"
    "  display: flex;\n"
    "  min-height: 100vh;\n"
    "}"
)

MAIN_STAGE_ORIGINAL = (
    ".main-stage {\n"
    "  flex: 1;\n"
    "  display: flex;\n"
    "  flex-direction: column;\n"
    "  min-width: 0;\n"
    "  padding: 12px 16px 24px 16px;\n"
    "  gap: 12px;\n"
    "}"
)

MAIN_STAGE_REPLACEMENT = (
    ".main-stage {\n"
    "  flex: 1;\n"
    "  display: flex;\n"
    "  flex-direction: column;\n"
    "  min-width: 0;\n"
    "  padding: 0;\n"
    "  gap: 12px;\n"
    "  width: 100%;\n"
    "}"
)


def drop_css_rule(text: str, selector: str) -> str:
    """Drop a CSS rule whose opening selector is exactly `selector {`."""
    pattern = re.compile(r"(^|\n)(\s*)" + re.escape(selector) + r"\s*\{")
    m = pattern.search(text)
    if not m:
        return text
    open_brace = text.find("{", m.end() - 1)
    if open_brace < 0:
        return text
    depth = 0
    for i in range(open_brace, len(text)):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                line_start = text.rfind("\n", 0, m.start()) + 1
                end = i + 1
                if end < len(text) and text[end] == "\n":
                    end += 1
                return text[:line_start] + text[end:]
    return text


def strip(html: str) -> str:
    text = html
    text = text.replace(APP_LAYOUT_ORIGINAL, APP_LAYOUT_REPLACEMENT)
    text = text.replace(MAIN_STAGE_ORIGINAL, MAIN_STAGE_REPLACEMENT)
    for selector in CSS_RULES_TO_DROP:
        text = drop_css_rule(text, selector)
    text = re.sub(
        r'\s*<!-- Sidebar -->\s*<aside class="sidebar">.*?</aside>\s*',
        "\n",
        text,
        flags=re.DOTALL,
    )
    text = re.sub(
        r'\s*<!-- Top Header -->\s*<header class="top-header">.*?</header>\s*',
        "\n",
        text,
        flags=re.DOTALL,
    )
    text = re.sub(r"\s*<!-- Main Stage -->\s*\n", "\n", text, flags=re.DOTALL)
    return text


def main() -> int:
    if not SOURCE.exists():
        print(f"Source not found: {SOURCE}", file=sys.stderr)
        return 1
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    src = SOURCE.read_text(encoding="utf-8")
    out = strip(src)
    TARGET.write_text(out, encoding="utf-8")
    print(
        f"Wrote {TARGET} ({len(out):,} bytes from {len(src):,}; "
        f"removed {len(src) - len(out):,} bytes of chrome)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())