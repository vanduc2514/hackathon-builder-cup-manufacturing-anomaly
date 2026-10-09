"""Tests for Interactive 5-Whys & Ishikawa Fishbone Diagram View (Issue #33).

Validates:
1. frontend/src/components/IshikawaViewer.tsx exists, exports default component, and satisfies Key Invariant #5.
2. Implements interactive Ishikawa fishbone layout covering all 6M industrial categories.
3. Implements causal highlighting (red/amber for causal root factors, green/neutral for ruled-out factors).
4. Implements expandable 5-Whys step tree with confidence scores and source citations.
5. Implements diagnostic evidence annotations (technician-submitted macro tool photos / TIR runout).
6. Implements presentation and print export capabilities (presentation mode, SVG download, JSON export).
7. Validates RootCauseCard compatibility and Dashboard integration.
"""

from __future__ import annotations

from pathlib import Path

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
COMPONENTS_DIR = FRONTEND_DIR / "src" / "components"
ISHIKAWA_FILE = COMPONENTS_DIR / "IshikawaViewer.tsx"
ROOT_CAUSE_CARD_FILE = COMPONENTS_DIR / "RootCauseCard.tsx"
DASHBOARD_FILE = FRONTEND_DIR / "src" / "pages" / "Dashboard.tsx"


def test_ishikawa_viewer_component_exists_and_exports() -> None:
    """Verifies that IshikawaViewer.tsx exists and has a default export function."""
    assert ISHIKAWA_FILE.exists(), f"IshikawaViewer.tsx must exist at {ISHIKAWA_FILE}"
    content = ISHIKAWA_FILE.read_text(encoding="utf-8")
    assert "export default function IshikawaViewer" in content, (
        "IshikawaViewer.tsx must export default function IshikawaViewer"
    )
    # Architecture invariant #5
    assert "localhost:8000" not in content, (
        "Key Invariant #5: IshikawaViewer must not contain hardcoded localhost backend address."
    )


def test_ishikawa_viewer_implements_6m_industrial_categories() -> None:
    """Verifies that IshikawaViewer.tsx defines and renders all 6M industrial dimensions."""
    content = ISHIKAWA_FILE.read_text(encoding="utf-8")
    six_m_categories = ["Machine", "Method", "Material", "Man", "Measurement", "Milieu"]

    for cat in six_m_categories:
        assert cat in content, f"IshikawaViewer.tsx must implement 6M category '{cat}'"

    # Verify both Vietnamese and English category labels are included for front-line presentation
    assert "THIẾT BỊ" in content, "Machine category should include Vietnamese industrial label"
    assert "QUY TRÌNH" in content, "Method category should include Vietnamese industrial label"
    assert "VẬT LIỆU" in content, "Material category should include Vietnamese industrial label"
    assert "CON NGƯỜI" in content, "Man category should include Vietnamese industrial label"
    assert "ĐO LƯỜNG" in content, "Measurement category should include Vietnamese industrial label"
    assert "MÔI TRƯỜNG" in content, "Milieu category should include Vietnamese industrial label"


def test_ishikawa_viewer_causal_highlighting() -> None:
    """Verifies causal highlighting differentiates affected bones from ruled-out / nominal branches."""
    content = ISHIKAWA_FILE.read_text(encoding="utf-8")

    # Causal indicators
    assert "CAUSAL" in content or "is_causal" in content, (
        "IshikawaViewer must indicate causal root factors"
    )
    assert "#EF4444" in content or "#DC2626" in content, (
        "Causal bones/factors must use prominent red/crimson warning colors"
    )
    assert "#F59E0B" in content or "#D97706" in content, (
        "Contributing/secondary causal bones must use amber warning colors"
    )

    # Ruled out / nominal indicators
    assert "#10B981" in content or "#065F46" in content, (
        "Ruled out / normal branches must use green/emerald neutral colors"
    )
    assert "RULED OUT" in content or "NOMINAL" in content, (
        "IshikawaViewer must tag uncorrupted branches as ruled out or nominal"
    )


def test_ishikawa_viewer_5_whys_step_tree() -> None:
    """Verifies the sequential 5-Whys deduction chain step-by-step with confidence scores and citations."""
    content = ISHIKAWA_FILE.read_text(encoding="utf-8")

    # 5 sequential levels
    assert "fiveWhysList" in content, "IshikawaViewer must maintain structured 5-Whys list"
    assert "step.level" in content or "Why" in content, "IshikawaViewer must render Why levels"
    assert "Root Cause" in content, "Level 5 must highlight Root Cause"
    assert "evidence" in content, "Each Why step must support evidence annotation"
    assert "citation" in content, "Each Why step must support source citation"
    assert "Confidence" in content or "confidence" in content, (
        "5-Whys deduction chain must display confidence scores"
    )


def test_ishikawa_viewer_diagnostic_evidence_annotations() -> None:
    """Verifies technician-submitted field evidence (macro tool photos / TIR runout) is attached."""
    content = ISHIKAWA_FILE.read_text(encoding="utf-8")

    # Field evidence inspection
    assert "FIELD EVIDENCE" in content, (
        "IshikawaViewer must visually render field evidence annotations"
    )
    assert "Flank Wear" in content or "VB" in content, (
        "Field evidence must display tool flank wear measurements (VB)"
    )
    assert "0.38" in content, (
        "Field evidence should show measured flank wear (0.38 mm vs 0.30 mm limit)"
    )
    assert "Runout" in content or "TIR" in content, (
        "Field evidence should show spindle runout TIR metrology"
    )


def test_ishikawa_viewer_presentation_and_export_capabilities() -> None:
    """Verifies presentation mode toggle, SVG vector export, and JSON export capabilities."""
    content = ISHIKAWA_FILE.read_text(encoding="utf-8")

    assert "Presentation" in content or "isPresentationMode" in content, (
        "IshikawaViewer must implement Presentation Mode for pitch decks & recordings"
    )
    assert "Export SVG" in content or "handleExportSvg" in content, (
        "IshikawaViewer must implement SVG vector diagram export"
    )
    assert "JSON" in content or "handleExportJson" in content, (
        "IshikawaViewer must implement structured JSON export"
    )
    assert "print" in content or "handlePrint" in content, (
        "IshikawaViewer must implement print / PDF export support"
    )


def test_dashboard_and_root_cause_card_integration() -> None:
    """Verifies that Dashboard.tsx and RootCauseCard.tsx integrate IshikawaViewer."""
    dashboard_content = DASHBOARD_FILE.read_text(encoding="utf-8")
    assert "IshikawaViewer" in dashboard_content, (
        "Dashboard.tsx must import and render IshikawaViewer"
    )

    rc_content = ROOT_CAUSE_CARD_FILE.read_text(encoding="utf-8")
    assert "IshikawaViewer" in rc_content, (
        "RootCauseCard.tsx should integrate or delegate to IshikawaViewer"
    )
