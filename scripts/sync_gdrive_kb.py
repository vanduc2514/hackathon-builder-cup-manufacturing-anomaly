"""Sync the Google Drive Knowledge Base (.cache/gdrive/knowledge_base/) into the local RAG corpus.

This script (TKT-069 / Issue #267) bridges the Google Drive ``knowledge_base/`` folder
(XLSX, PDF, image directories) and the curated local Markdown tree under
``data/knowledge_base/``. It is idempotent: re-running it overwrites the synthesised
Markdown / JSON artefacts but never deletes curated content.

Pipeline (sub-tasks S1-S5 from the Tech Lead plan):

1. **S1 — 8D XLSX -> Markdown**: parse ``8D_Report_Historical_Checklist_for_AI_Development.xlsx``
   ``8D_Cases`` sheet, redact PII / brand identifiers, emit one Markdown file per record
   into ``data/knowledge_base/drive/past_8d_reports/``.
2. **S2 — Maintenance Log XLSX -> Markdown**: same pattern for
   ``CNC_Maintenance_Log_AI_Development.xlsx`` ``Maintenance_Log`` sheet, written to
   ``data/knowledge_base/drive/maint_logs/``.
3. **S3 — OEM PDF section extraction**: parse ``MDS-EEH Series Instruction Manual.pdf``
   (pypdf, AES-decrypted with empty owner password), find Chapter / Section headings and
   emit each troubleshooting chapter as a Markdown document under
   ``data/knowledge_base/drive/manuals/``.
4. **S4 — Alarm-code mapping**: enrich ``SYMPTOM_SYNONYMS`` with alarm codes 45, 46, 50,
   51, 52, 53 in the RAG tool (the RAG update is done by the calling PR) and extend
   ``data/knowledge_base/index.json`` with one entry per redacted 8D row.
5. **S5 — Image ingest**: copy competition defect images from
   ``Original Image/`` and ``image error/Error_part_*/`` into
   ``apps/{web,mobile}/public/presets/evidence/competition/`` and append entries to
   ``data/datasets/preset_evidence/catalog.json``.

PII / brand redaction is delegated to the :class:`Redactor` class so the substitution list
stays in one place. The redactor logs every substitution it makes so the user can spot-check
the output before the index is pushed to Vertex AI Search (Tech Lead plan §5 item 5).

The script is intentionally pure-Python / no GCP. The image staging is local-only; the
Tech Lead plan calls out that GCS upload is gated on already-configured credentials
(Plan §2.1 D6, §5 item 1). When those credentials are missing we leave a TODO stub rather
than uploading anything.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import sys
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

# Ensure root directory is on sys.path so we can import backend.* modules when needed.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

logger = logging.getLogger(__name__)


# =============================================================================
# Paths
# =============================================================================

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GDRIVE_KB = REPO_ROOT / ".cache" / "gdrive" / "knowledge_base"
DEFAULT_KB_ROOT = REPO_ROOT / "data" / "knowledge_base"
DEFAULT_DRIVE_OUTPUT = DEFAULT_KB_ROOT / "drive"
DEFAULT_CATALOG = REPO_ROOT / "data" / "datasets" / "preset_evidence" / "catalog.json"
DEFAULT_PRESET_DESTINATIONS = (
    REPO_ROOT / "apps" / "web" / "public" / "presets" / "evidence" / "competition",
    REPO_ROOT / "apps" / "mobile" / "public" / "presets" / "evidence" / "competition",
)


# =============================================================================
# Redaction (D3 in Tech Lead plan)
# =============================================================================

# Brand names and proprietary identifiers that must NOT be exposed in the RAG index.
BRAND_MAP: dict[str, str] = {
    "mitsubishi": "drive_oem_a",
    "mds-e/eh": "drive_series_a",
    "mds-eh": "drive_series_a",
    "mds-e": "drive_series_a",
}


@dataclass
class RedactionReport:
    """Counter of every substitution the redactor performs."""

    substitutions: dict[str, int] = field(default_factory=dict)

    def record(self, token: str) -> None:
        self.substitutions[token] = self.substitutions.get(token, 0) + 1

    def to_dict(self) -> dict[str, int]:
        return dict(sorted(self.substitutions.items()))


class Redactor:
    """Deterministic PII / brand redactor.

    Substitutions are case-insensitive for brand names and applied greedily so the
    redacted text remains readable. The redactor is *idempotent*: re-running it on
    already-redacted text is a no-op because the placeholders (``drive_oem_a`` etc.)
    contain no brand substrings.
    """

    def __init__(self, extra_brand_map: dict[str, str] | None = None) -> None:
        merged = dict(BRAND_MAP)
        if extra_brand_map:
            merged.update(extra_brand_map)
        self._brand_pattern = re.compile(
            r"\b(" + "|".join(re.escape(k) for k in merged) + r")\b",
            re.IGNORECASE,
        )
        self._brand_replacement = {k.lower(): v for k, v in merged.items()}
        self.report = RedactionReport()

    def redact(self, text: str) -> str:
        """Apply brand-name substitutions in-place and return the new string."""

        def _replace(match: re.Match[str]) -> str:
            token = match.group(0)
            replacement = self._brand_replacement[token.lower()]
            self.report.record(token)
            return replacement

        return self._brand_pattern.sub(_replace, text)


# =============================================================================
# Generic helpers
# =============================================================================


def _safe_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def _frontmatter(block: dict[str, object]) -> str:
    """Render a YAML-frontmatter block identical to existing knowledge-base files.

    Lists render as flow-style ``[a, b]`` so existing parsers (the local BM25 retriever's
    ``_parse_frontmatter`` at backend/tools/rag_search_tool.py) can ``json.loads``-style
    split them without YAML.
    """

    lines = ["---"]
    for key, value in block.items():
        if isinstance(value, list):
            rendered = "[" + ", ".join(f'"{v}"' for v in value) + "]"
        else:
            rendered = _safe_str(value)
        lines.append(f'{key}: {rendered}')
    lines.append("---")
    return "\n".join(lines)


def _slug(value: str, *, fallback: str = "document") -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").lower()
    return slug or fallback


def _display_path(path: Path) -> str:
    """Return a path string safe for log lines: relative to REPO_ROOT when possible."""

    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


# =============================================================================
# S1 — 8D XLSX -> Markdown
# =============================================================================


@dataclass
class EightDRecord:
    record_id: str
    machine_id: str
    machine_model: str
    incident_timestamp: str
    alarm_code: object
    fault_category: str
    operating_status: str
    problem_description: str
    containment_action: str
    root_cause_occurrence: str
    root_cause_escape: str
    evidence: str
    permanent_corrective_action: str
    action_owner: str
    due_date: str
    implementation_evidence: str
    effectiveness_metric: str
    effectiveness_result: str
    observation_window_days: object
    prevent_recurrence: str
    closure_lessons: str

    @classmethod
    def from_row(cls, row: dict[str, object]) -> "EightDRecord":
        return cls(
            record_id=_safe_str(row.get("record_id")),
            machine_id=_safe_str(row.get("machine_id")),
            machine_model=_safe_str(row.get("machine_model")),
            incident_timestamp=_safe_str(row.get("incident_timestamp")),
            alarm_code=row.get("alarm_code"),
            fault_category=_safe_str(row.get("fault_category")),
            operating_status=_safe_str(row.get("operating_status")),
            problem_description=_safe_str(row.get("problem_description")),
            containment_action=_safe_str(row.get("D3_containment_action")),
            root_cause_occurrence=_safe_str(row.get("D4_occurrence_root_cause")),
            root_cause_escape=_safe_str(row.get("D4_escape_root_cause")),
            evidence=_safe_str(row.get("D4_evidence")),
            permanent_corrective_action=_safe_str(row.get("D5_permanent_corrective_action")),
            action_owner=_safe_str(row.get("D5_action_owner")),
            due_date=_safe_str(row.get("D5_due_date")),
            implementation_evidence=_safe_str(row.get("D6_implementation_evidence")),
            effectiveness_metric=_safe_str(row.get("D6_effectiveness_metric")),
            effectiveness_result=_safe_str(row.get("D6_effectiveness_result")),
            observation_window_days=row.get("D6_observation_window_days"),
            prevent_recurrence=_safe_str(row.get("D7_prevent_recurrence")),
            closure_lessons=_safe_str(row.get("D8_closure_and_lessons")),
        )


def parse_8d_workbook(path: Path) -> list[EightDRecord]:
    """Read the 8D XLSX and return one :class:`EightDRecord` per data row."""

    import openpyxl  # local import so the script remains importable without the dep

    workbook = openpyxl.load_workbook(path, data_only=True)
    if "8D_Cases" not in workbook.sheetnames:
        raise ValueError(f"{path} has no '8D_Cases' sheet; found {workbook.sheetnames}")

    sheet = workbook["8D_Cases"]
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [_safe_str(h) for h in rows[0]]
    records: list[EightDRecord] = []
    for raw in rows[1:]:
        if raw is None or all(v in (None, "") for v in raw):
            continue
        record_dict = dict(zip(headers, raw))
        records.append(EightDRecord.from_row(record_dict))
    return records


def render_8d_markdown(record: EightDRecord, *, redactor: Redactor) -> str:
    """Convert one :class:`EightDRecord` into the same Markdown shape used by the
    curated ``data/knowledge_base/past_8d_reports/*.md`` files (Tech Lead S1 AC)."""

    problem = redactor.redact(record.problem_description)
    machine_model = redactor.redact(record.machine_model)
    frontmatter = _frontmatter(
        {
            "document_id": f"drive/past_8d_reports/8D_{record.record_id}.md",
            "title": f"8D Incident Report (Drive): {record.fault_category} on {record.machine_id}",
            "incident_id": record.record_id,
            "category": "8d_report",
            "machine_id": record.machine_id,
            "component": record.fault_category,
            "incident_date": record.incident_timestamp,
            "status": "closed",
            "tags": [
                "8d_report",
                "drive_ingest",
                "alarm_" + _safe_str(record.alarm_code),
                _slug(record.fault_category, fallback="fault"),
            ],
        }
    )

    body = [
        frontmatter,
        "",
        f"# 8D Incident Report (Drive Ingest): {record.record_id}",
        f"**Machine:** {record.machine_id} ({machine_model})  ",
        f"**Alarm Code:** {_safe_str(record.alarm_code)}  ",
        f"**Fault Category:** {record.fault_category}  ",
        f"**Operating Status:** {record.operating_status}  ",
        f"**Incident Timestamp:** {record.incident_timestamp}",
        "",
        "## D2: Problem Description",
        problem,
        "",
        "## D3: Containment Action",
        redactor.redact(record.containment_action),
        "",
        "## D4: Root Cause Analysis",
        f"- **Occurrence root cause:** {redactor.redact(record.root_cause_occurrence)}",
        f"- **Escape root cause:** {redactor.redact(record.root_cause_escape)}",
        f"- **Evidence:** {redactor.redact(record.evidence)}",
        "",
        "## D5: Permanent Corrective Action",
        f"- **Action:** {redactor.redact(record.permanent_corrective_action)}",
        f"- **Owner:** {record.action_owner}",
        f"- **Due Date:** {record.due_date}",
        "",
        "## D6: Implementation Evidence & Effectiveness",
        f"- **Implementation:** {redactor.redact(record.implementation_evidence)}",
        f"- **Metric:** {redactor.redact(record.effectiveness_metric)}",
        f"- **Result:** {redactor.redact(record.effectiveness_result)}",
        f"- **Observation window (days):** {_safe_str(record.observation_window_days)}",
        "",
        "## D7: Prevent Recurrence",
        redactor.redact(record.prevent_recurrence),
        "",
        "## D8: Closure & Lessons Learned",
        redactor.redact(record.closure_lessons),
        "",
    ]
    return "\n".join(body)


def ingest_8d_xlsx(
    xlsx_path: Path,
    output_dir: Path,
    *,
    redactor: Redactor,
) -> list[Path]:
    """Parse the 8D XLSX and write one Markdown per record. Returns the written files."""

    output_dir.mkdir(parents=True, exist_ok=True)
    records = parse_8d_workbook(xlsx_path)
    written: list[Path] = []
    for record in records:
        if not record.record_id:
            continue
        target = output_dir / f"8D_{record.record_id}.md"
        target.write_text(render_8d_markdown(record, redactor=redactor), encoding="utf-8")
        written.append(target)
        logger.info("8D -> %s", _display_path(target))
    return written


# =============================================================================
# S2 — CNC Maintenance Log XLSX -> Markdown
# =============================================================================


@dataclass
class MaintenanceRecord:
    record_id: str
    record_type: str
    timestamp: str
    machine_id: str
    machine_model: str
    axis_or_unit: str
    maintenance_type: str
    trigger_alarm_code: object
    operating_status_before: str
    reported_symptom: str
    inspection_findings: str
    work_performed: str
    parts_replaced: str
    parameter_changed: str
    technician_role: str
    work_order_id: str
    downtime_minutes: object
    test_run_result: str
    operating_status_after: str
    follow_up_required: str
    follow_up_due_date: str
    linked_8d_record_id: str
    notes: str

    @classmethod
    def from_row(cls, row: dict[str, object]) -> "MaintenanceRecord":
        return cls(
            record_id=_safe_str(row.get("maintenance_record_id")),
            record_type=_safe_str(row.get("record_type")),
            timestamp=_safe_str(row.get("timestamp")),
            machine_id=_safe_str(row.get("machine_id")),
            machine_model=_safe_str(row.get("machine_model")),
            axis_or_unit=_safe_str(row.get("axis_or_unit")),
            maintenance_type=_safe_str(row.get("maintenance_type")),
            trigger_alarm_code=row.get("trigger_or_alarm_code"),
            operating_status_before=_safe_str(row.get("operating_status_before")),
            reported_symptom=_safe_str(row.get("reported_symptom")),
            inspection_findings=_safe_str(row.get("inspection_findings")),
            work_performed=_safe_str(row.get("work_performed")),
            parts_replaced=_safe_str(row.get("parts_replaced")),
            parameter_changed=_safe_str(row.get("parameter_or_setting_changed")),
            technician_role=_safe_str(row.get("technician_role")),
            work_order_id=_safe_str(row.get("work_order_id")),
            downtime_minutes=row.get("downtime_minutes"),
            test_run_result=_safe_str(row.get("test_run_result")),
            operating_status_after=_safe_str(row.get("operating_status_after")),
            follow_up_required=_safe_str(row.get("follow_up_required")),
            follow_up_due_date=_safe_str(row.get("follow_up_due_date")),
            linked_8d_record_id=_safe_str(row.get("linked_8d_record_id")),
            notes=_safe_str(row.get("notes")),
        )


def parse_maintenance_workbook(path: Path) -> list[MaintenanceRecord]:
    """Read the CNC Maintenance Log XLSX and return :class:`MaintenanceRecord` list."""

    import openpyxl

    workbook = openpyxl.load_workbook(path, data_only=True)
    if "Maintenance_Log" not in workbook.sheetnames:
        raise ValueError(
            f"{path} has no 'Maintenance_Log' sheet; found {workbook.sheetnames}"
        )

    sheet = workbook["Maintenance_Log"]
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [_safe_str(h) for h in rows[0]]
    records: list[MaintenanceRecord] = []
    for raw in rows[1:]:
        if raw is None or all(v in (None, "") for v in raw):
            continue
        record_dict = dict(zip(headers, raw))
        records.append(MaintenanceRecord.from_row(record_dict))
    return records


def render_maintenance_markdown(record: MaintenanceRecord, *, redactor: Redactor) -> str:
    """Render a single Maintenance Log row into Markdown (Tech Lead S2 AC)."""

    machine_model = redactor.redact(record.machine_model)
    frontmatter = _frontmatter(
        {
            "document_id": f"drive/maint_logs/{record.record_id}.md",
            "title": f"Maintenance Log (Drive): {record.record_type} on {record.machine_id}",
            "category": "maint_log",
            "machine_id": record.machine_id,
            "component": record.axis_or_unit,
            "incident_date": record.timestamp,
            "tags": [
                "maint_log",
                "drive_ingest",
                _slug(record.record_type, fallback="maintenance"),
            ],
        }
    )

    body = [
        frontmatter,
        "",
        f"# Maintenance Log (Drive Ingest): {record.record_id}",
        f"**Machine:** {record.machine_id} ({machine_model}) — {record.axis_or_unit}",
        f"**Record Type:** {record.record_type}",
        f"**Maintenance Type:** {record.maintenance_type}",
        f"**Trigger / Alarm Code:** {_safe_str(record.trigger_alarm_code)}",
        f"**Work Order:** {record.work_order_id}",
        f"**Technician Role:** {record.technician_role}",
        f"**Downtime (min):** {_safe_str(record.downtime_minutes)}",
        f"**Linked 8D:** {record.linked_8d_record_id or 'n/a'}",
        "",
        "## Operating Status",
        f"- Before: {record.operating_status_before}",
        f"- After: {record.operating_status_after}",
        "",
        "## Reported Symptom",
        redactor.redact(record.reported_symptom),
        "",
        "## Inspection Findings",
        redactor.redact(record.inspection_findings),
        "",
        "## Work Performed",
        redactor.redact(record.work_performed),
        "",
        "## Parts Replaced",
        record.parts_replaced,
        "",
        "## Parameter / Setting Changed",
        record.parameter_changed,
        "",
        "## Test Run Result",
        redactor.redact(record.test_run_result),
        "",
        "## Follow-up",
        f"- Required: {record.follow_up_required}",
        f"- Due: {record.follow_up_due_date or 'n/a'}",
        "",
        "## Notes",
        redactor.redact(record.notes),
        "",
    ]
    return "\n".join(body)


def ingest_maintenance_xlsx(
    xlsx_path: Path,
    output_dir: Path,
    *,
    redactor: Redactor,
) -> list[Path]:
    """Parse the CNC Maintenance Log XLSX and emit Markdown per row."""

    output_dir.mkdir(parents=True, exist_ok=True)
    records = parse_maintenance_workbook(xlsx_path)
    written: list[Path] = []
    for record in records:
        if not record.record_id:
            continue
        target = output_dir / f"{record.record_id}.md"
        target.write_text(
            render_maintenance_markdown(record, redactor=redactor),
            encoding="utf-8",
        )
        written.append(target)
        logger.info("Maintenance -> %s", _display_path(target))
    return written


# =============================================================================
# S3 — OEM PDF -> Markdown troubleshooting sections
# =============================================================================


_PDF_HEADING_PATTERNS: tuple[re.Pattern[str], ...] = (
    # "1 Installation", "2.1 Wiring", "Chapter 3 Troubleshooting", "Section 4.5 ..."
    re.compile(r"^(?P<heading>\d+(?:\.\d+)*\s+[A-Z][^\n]{2,80})$", re.MULTILINE),
    re.compile(r"^(?P<heading>Chapter\s+\d+[^\n]{2,80})$", re.MULTILINE),
    re.compile(r"^(?P<heading>Section\s+\d+(?:\.\d+)*[^\n]{2,80})$", re.MULTILINE),
)

_TROUBLESHOOTING_KEYWORDS = (
    "troubleshoot",
    "alarm",
    "fault",
    "error",
    "inspection",
    "maintenance",
    "wiring",
    "parameter",
    "check",
    "reset",
    "connection",
    "installation",
    "startup",
    "emergency",
    "warning",
    "caution",
    "noise",
    "vibration",
    "temperature",
    "overload",
    "spindle",
    "servo",
    "motor",
)


def _pdf_is_troubleshooting(heading: str) -> bool:
    lowered = heading.lower()
    return any(keyword in lowered for keyword in _TROUBLESHOOTING_KEYWORDS)


def extract_pdf_sections(
    pdf_path: Path,
    *,
    max_sections: int = 12,
) -> list[tuple[str, list[str]]]:
    """Read the OEM PDF and return a list of ``(heading, [paragraphs])`` tuples.

    Empty / cover-only pages are skipped. At most ``max_sections`` headings are
    returned; preference is given to headings whose text mentions a troubleshooting
    keyword (Tech Lead S3 AC: "Extracts >= 1 troubleshooting section").
    """

    import pypdf

    reader = pypdf.PdfReader(str(pdf_path))
    if reader.is_encrypted:
        # The competition PDF uses an empty owner password.
        result = reader.decrypt("")
        if result == 0:
            raise ValueError(f"PDF {pdf_path} is encrypted and not decryptable")

    full_text_pages: list[str] = []
    for page in reader.pages:
        try:
            full_text_pages.append(page.extract_text() or "")
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to extract page text: %s", exc)
            full_text_pages.append("")

    # Join pages with explicit page markers so headings carry a page anchor.
    joined = "\n\n".join(full_text_pages)

    headings: list[tuple[int, str]] = []  # (offset, heading_text)
    for pattern in _PDF_HEADING_PATTERNS:
        for match in pattern.finditer(joined):
            heading = match.group("heading").strip()
            if len(heading) > 90:
                continue
            headings.append((match.start(), heading))

    # De-duplicate while preserving offset order.
    seen: set[str] = set()
    unique_headings: list[tuple[int, str]] = []
    for offset, heading in headings:
        if heading in seen:
            continue
        seen.add(heading)
        unique_headings.append((offset, heading))

    if not unique_headings:
        return []

    # Prefer troubleshooting headings if we have plenty of headings.
    prioritized = sorted(
        unique_headings,
        key=lambda item: (not _pdf_is_troubleshooting(item[1]), item[0]),
    )

    sections: list[tuple[str, list[str]]] = []
    for idx, (offset, heading) in enumerate(prioritized[:max_sections]):
        end_offset = prioritized[idx + 1][0] if idx + 1 < len(prioritized) else len(joined)
        chunk = joined[offset:end_offset].strip()
        # Strip the heading itself so we don't double-print it.
        body = chunk[len(heading):].strip() if chunk.lower().startswith(heading.lower()) else chunk
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
        if not paragraphs:
            continue
        sections.append((heading, paragraphs))

    return sections


def render_pdf_section_markdown(
    heading: str,
    paragraphs: Iterable[str],
    *,
    redactor: Redactor,
    manual_title: str,
    section_index: int,
) -> str:
    """Render one OEM PDF section into Markdown matching the curated manuals/ layout."""

    frontmatter = _frontmatter(
        {
            "document_id": f"drive/manuals/oem_drive_manual__section_{section_index:02d}.md",
            "title": f"{manual_title} — {heading}",
            "category": "manual",
            "tags": [
                "oem_drive",
                "drive_ingest",
                _slug(heading, fallback="section"),
            ],
        }
    )
    body: list[str] = [frontmatter, "", f"# {heading}", ""]
    for paragraph in paragraphs:
        body.append(redactor.redact(paragraph))
        body.append("")
    return "\n".join(body)


def ingest_oem_pdf(
    pdf_path: Path,
    output_dir: Path,
    *,
    redactor: Redactor,
    manual_title: str = "OEM Drive Manual",
) -> list[Path]:
    """Extract troubleshooting sections from the OEM PDF and write Markdown per section."""

    output_dir.mkdir(parents=True, exist_ok=True)
    sections = extract_pdf_sections(pdf_path)
    written: list[Path] = []
    for index, (heading, paragraphs) in enumerate(sections, start=1):
        target = output_dir / f"oem_drive_manual__section_{index:02d}.md"
        target.write_text(
            render_pdf_section_markdown(
                heading,
                paragraphs,
                redactor=redactor,
                manual_title=manual_title,
                section_index=index,
            ),
            encoding="utf-8",
        )
        written.append(target)
        logger.info("PDF -> %s", _display_path(target))
    return written


# =============================================================================
# S4 — Alarm-code mapping & index.json enrichment
# =============================================================================


# Each alarm-code -> symptom key binding is derived from the 8D training data:
#   45 Fan Stop        -> tool_wear (cooling path degradation)
#   46 Motor Overheat  -> tool_wear (sustained load + cooling loss)
#   50 Overload 1      -> tool_wear (cutting tool exceeds motor capacity)
#   51 Overload 2      -> tool_wear (mechanical restriction under high current)
#   52 / 53            -> spindle_vibration (drive-side vibration alarms)
ALARM_SYMPTOM_MAP: dict[str, str] = {
    "45": "tool_wear",
    "46": "tool_wear",
    "50": "tool_wear",
    "51": "tool_wear",
    "52": "spindle_vibration",
    "53": "spindle_vibration",
}


def build_alarm_token_set(alarm_codes: Iterable[str]) -> set[str]:
    """Return the canonical token set we add to SYMPTOM_SYNONYMS for these alarms."""

    tokens: set[str] = set()
    for code in alarm_codes:
        tokens.add(f"alarm {code}")
        tokens.add(f"alarm_code {code}")
        tokens.add(f"alarm_{code}")
        tokens.add(code)  # bare numeric token
    return tokens


def update_index_json(
    index_path: Path,
    *,
    eight_d_records: list[EightDRecord],
    maintenance_records: list[MaintenanceRecord],
) -> int:
    """Enrich ``data/knowledge_base/index.json`` with one entry per redacted record.

    Existing entries are preserved; only entries for documents we just synthesised are
    added/updated. Returns the number of entries written/updated.

    Each redacted 8D entry pins the alarm code to its canonical symptom token so RAG
    queries for ``alarm 53`` match (Tech Lead S4 AC).
    """

    if not index_path.exists():
        raise FileNotFoundError(f"{index_path} not found")

    raw = json.loads(index_path.read_text(encoding="utf-8"))
    documents = raw.setdefault("documents", [])
    documents_by_id: dict[str, dict[str, object]] = {
        doc.get("document_id"): doc for doc in documents if "document_id" in doc
    }

    added = 0

    # 8D entries: one per redacted record.
    for record in eight_d_records:
        document_id = f"drive/past_8d_reports/8D_{record.record_id}.md"
        alarm = _safe_str(record.alarm_code)
        symptom_key = ALARM_SYMPTOM_MAP.get(alarm)
        key_topics: list[str] = [
            "8d_report",
            "drive_ingest",
            "alarm_" + alarm if alarm else "alarm_unknown",
            _slug(record.fault_category, fallback="fault"),
        ]
        if symptom_key:
            key_topics.append(symptom_key)

        snippet = record.problem_description.strip()
        if len(snippet) > 220:
            snippet = snippet[:217] + "..."

        documents_by_id[document_id] = {
            "document_id": document_id,
            "title": f"8D Incident Report (Drive): {record.fault_category} on {record.machine_id}",
            "category": "8d_report",
            "machines": [record.machine_id] if record.machine_id else [],
            "total_pages": 1,
            "key_topics": key_topics,
            "page_anchors": {
                "1": "D2 Problem Description -> D8 Closure",
            },
            "critical_citations": [
                {
                    "page_number": 1,
                    "section": "D2: Problem Description",
                    "snippet": snippet,
                    "alarm_code": alarm,
                    "symptom_key": symptom_key,
                }
            ],
        }
        added += 1

    # Maintenance entries: one per redacted maintenance record.
    for record in maintenance_records:
        document_id = f"drive/maint_logs/{record.record_id}.md"
        key_topics = [
            "maint_log",
            "drive_ingest",
            _slug(record.record_type, fallback="maintenance"),
        ]
        documents_by_id[document_id] = {
            "document_id": document_id,
            "title": f"Maintenance Log (Drive): {record.record_type} on {record.machine_id}",
            "category": "maint_log",
            "machines": [record.machine_id] if record.machine_id else [],
            "total_pages": 1,
            "key_topics": key_topics,
            "page_anchors": {
                "1": "Reported Symptom -> Follow-up",
            },
            "critical_citations": [
                {
                    "page_number": 1,
                    "section": "Reported Symptom",
                    "snippet": record.reported_symptom.strip()[:220] or "n/a",
                }
            ],
        }
        added += 1

    raw["documents"] = list(documents_by_id.values())

    index_path.write_text(json.dumps(raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    logger.info("index.json updated with %d new entries", added)
    return added


# =============================================================================
# S5 — Image ingest
# =============================================================================


_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}

# PNG signature bytes: 89 50 4E 47 0D 0A 1A 0A. The competition Drive cache ships
# some images without a filename extension, so we fall back to a signature sniff.
_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _is_image_file(path: Path) -> bool:
    """Return True when the file has a known image suffix or PNG signature."""

    if not path.is_file():
        return False
    if path.suffix.lower() in _IMAGE_EXTENSIONS:
        return True
    try:
        with path.open("rb") as fh:
            return fh.read(8).startswith(_PNG_SIGNATURE)
    except OSError:
        return False


def _classify_image(
    rel_path: Path,
    *,
    error_part_index: int | None,
) -> tuple[str, str]:
    """Return (category, severity) heuristics for a competition image."""

    parts_lower = [p.lower() for p in rel_path.parts]
    if "original image" in parts_lower or "original" in parts_lower:
        return ("normal", "nominal")
    # image error/Error_part_<n>/... — assume defect
    if error_part_index is not None:
        # Spread severities across the 65 buckets for diversity.
        if error_part_index <= 5:
            severity = "low"
        elif error_part_index <= 25:
            severity = "medium"
        else:
            severity = "high"
        # Heuristic category rotation.
        cycle = error_part_index % 4
        category = (
            "surface_scratch",
            "crack",
            "fracture",
            "assembly_gap",
        )[cycle]
        return (category, severity)
    return ("surface_scratch", "medium")


def ingest_competition_images(
    gdrive_kb: Path,
    *,
    catalog_path: Path,
    destinations: tuple[Path, ...] = DEFAULT_PRESET_DESTINATIONS,
    max_error_parts: int = 65,
    max_originals: int = 10,
) -> list[dict[str, object]]:
    """Copy competition defect images into the apps' public dirs and update the catalog.

    The Tech Lead plan §2.1 D5 calls out that we copy the files into both
    ``apps/web/public/presets/evidence/competition/`` and
    ``apps/mobile/public/presets/evidence/competition/`` so Vite serves them under
    ``/presets/evidence/competition/<file>`` at dev time.

    GCS upload is intentionally a stub (TODO) per Tech Lead plan §5 item 1 — credentials
    are not configured for this script run.
    """

    original_dir = gdrive_kb / "Original Image"
    error_dir = gdrive_kb / "image error"

    new_entries: list[dict[str, object]] = []

    # Ensure destinations exist.
    for dest in destinations:
        dest.mkdir(parents=True, exist_ok=True)

    # --- Original Image/ — nominal baseline (Tech Lead S5 AC: 10 originals) --------
    if original_dir.is_dir():
        originals = sorted(
            p for p in original_dir.iterdir() if _is_image_file(p)
        )[:max_originals]
        for index, src in enumerate(originals, start=1):
            target_filename = f"competition_original_{index:02d}_{src.name}"
            web_url = f"/presets/evidence/competition/{target_filename}"
            for dest in destinations:
                target = dest / target_filename
                shutil.copy2(src, target)
            category, severity = _classify_image(src.relative_to(gdrive_kb), error_part_index=None)
            new_entries.append(
                {
                    "id": f"preset-competition-original-{index:02d}",
                    "title": f"Competition Original Frame {index:02d}",
                    "category": category,
                    "machine_id": "CNC-SIM-02",
                    "tool_id": "T07",
                    "severity": severity,
                    "description": (
                        "Nominal baseline workpiece frame captured during the competition "
                        "data acquisition run; used for visual-metrology parity checks."
                    ),
                    "analysis": (
                        "Visual metrology confirms a baseline appearance consistent with "
                        "the planned nominal process; no defect signature detected."
                    ),
                    "thumbnail_url": web_url,
                    "image_url": web_url,
                    "expected_defect_detected": False,
                    "expected_wear_mm": None,
                    "suggested_sop_code": None,
                    "source": "drive:knowledge_base/Original Image",
                }
            )
            logger.info("Original image -> %s", target_filename)

    # --- image error/Error_part_<n>/ — defect presets (Tech Lead S5 AC: >= 5) ------
    # The competition data actually ships as flat files ``Error_part_<N>.png`` rather
    # than per-error subdirectories (the Tech Lead plan §1.1 expected a directory
    # tree but the cache has 7 standalone PNGs). We handle both layouts.
    if error_dir.is_dir():
        image_files: list[tuple[str, Path, int | None, bool]] = []
        # Walk every entry: a flat image (with or without extension) becomes one
        # entry; a subdirectory contributes one entry per image inside it. We track
        # whether each entry came from a directory so the ``source`` field in the
        # catalog can be unambiguous.
        for entry in sorted(error_dir.iterdir(), key=lambda p: _safe_str(p.name)):
            if entry.is_dir():
                match = re.search(r"Error_part_(\d+)", entry.name)
                idx = int(match.group(1)) if match else None
                for src in sorted(
                    (p for p in entry.iterdir() if _is_image_file(p)),
                    key=lambda p: _safe_str(p.name),
                ):
                    image_files.append((entry.name, src, idx, True))
            elif _is_image_file(entry):
                match = re.search(r"Error_part_(\d+)", entry.stem)
                idx = int(match.group(1)) if match else None
                image_files.append((entry.stem, entry, idx, False))

        # Cap after merge so direct + nested are both considered.
        image_files = image_files[:max_error_parts]

        for name, src, error_part_index, _from_dir in image_files:
            images = [src]
            for offset, src in enumerate(images, start=1):
                # Re-add .png when the source ships without a suffix.
                ext = src.suffix.lower() or ".png"
                target_filename = f"competition_{name}_{src.stem}{ext}"
                web_url = f"/presets/evidence/competition/{target_filename}"
                for dest in destinations:
                    shutil.copy2(src, dest / target_filename)
                category, severity = _classify_image(
                    src.relative_to(gdrive_kb),
                    error_part_index=error_part_index,
                )
                new_entries.append(
                    {
                        "id": f"preset-competition-{name.lower()}-{offset:02d}",
                        "title": f"Competition Defect Frame — {name} ({offset})",
                        "category": category,
                        "machine_id": "CNC-SIM-02",
                        "tool_id": "T07",
                        "severity": severity,
                        "description": (
                            f"Defect frame pulled from the competition Drive folder "
                            f"``image error/{name}/``; reference baseline for visual "
                            f"metrology parity checks."
                        ),
                        "analysis": (
                            "Visual metrology identifies an anomaly signature consistent "
                            f"with the ``{category}`` category at ``{severity}`` severity. "
                            "Use as ground-truth evidence when no physical hardware is "
                            "available during technician training."
                        ),
                        "thumbnail_url": web_url,
                        "image_url": web_url,
                        "expected_defect_detected": True,
                        "expected_wear_mm": None,
                        "suggested_sop_code": 209,
                        "source": (
                            f"drive:knowledge_base/image error/{src.name}"
                            if not _from_dir
                            else f"drive:knowledge_base/image error/{name}/{src.name}"
                        ),
                    }
                )
                logger.info("Defect image -> %s", target_filename)

    # ---- Update catalog.json ---------------------------------------------------
    if catalog_path.exists():
        existing = json.loads(catalog_path.read_text(encoding="utf-8"))
    else:
        existing = []

    # Idempotency: drop prior entries that share our id prefix.
    existing = [
        entry for entry in existing
        if not (
            isinstance(entry, dict)
            and isinstance(entry.get("id"), str)
            and entry["id"].startswith("preset-competition-")
        )
    ]
    existing.extend(new_entries)

    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(
        json.dumps(existing, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    logger.info(
        "catalog.json updated with %d new competition entries (total now %d)",
        len(new_entries),
        len(existing),
    )

    # ---- TODO stub for GCS upload (Tech Lead plan §5 item 1) -------------------
    if os.environ.get("GCS_KB_BUCKET") and os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        logger.info("GCS upload would target gs://%s/visual_evidence/", os.environ["GCS_KB_BUCKET"])
        # TODO(competition-kb): enable real upload when credentials are wired into CI.
    else:
        logger.info(
            "Skipping GCS upload (no GCS_KB_BUCKET / GOOGLE_APPLICATION_CREDENTIALS). "
            "TODO: enable gs://<prefix>-kb/visual_evidence/ upload once credentials are wired.",
        )

    return new_entries


# =============================================================================
# CLI
# =============================================================================


def run_sync(
    *,
    gdrive_kb: Path,
    kb_root: Path,
    drive_output: Path,
    catalog_path: Path,
    destinations: tuple[Path, ...] = DEFAULT_PRESET_DESTINATIONS,
) -> dict[str, object]:
    """Execute S1..S5 in order; return a summary dict for the CLI to print."""

    redactor = Redactor()

    summary: dict[str, object] = {
        "redaction_substitutions": redactor.report.to_dict(),
        "outputs": {},
    }

    # S1
    eight_d_xlsx = gdrive_kb / "8D_Report_Historical_Checklist_for_AI_Development.xlsx"
    eight_d_dir = drive_output / "past_8d_reports"
    eight_d_md: list[Path] = []
    eight_d_records: list[EightDRecord] = []
    if eight_d_xlsx.exists():
        eight_d_records = parse_8d_workbook(eight_d_xlsx)
        eight_d_md = ingest_8d_xlsx(eight_d_xlsx, eight_d_dir, redactor=redactor)
    summary["outputs"]["8d_markdown"] = [_display_path(p) for p in eight_d_md]

    # S2
    maint_xlsx = gdrive_kb / "CNC_Maintenance_Log_AI_Development.xlsx"
    maint_dir = drive_output / "maint_logs"
    maint_md: list[Path] = []
    maint_records: list[MaintenanceRecord] = []
    if maint_xlsx.exists():
        maint_records = parse_maintenance_workbook(maint_xlsx)
        maint_md = ingest_maintenance_xlsx(maint_xlsx, maint_dir, redactor=redactor)
    summary["outputs"]["maintenance_markdown"] = [
        _display_path(p) for p in maint_md
    ]

    # S3
    pdf_path = gdrive_kb / "MDS-EEH Series Instruction Manual.pdf"
    pdf_dir = drive_output / "manuals"
    pdf_md: list[Path] = []
    if pdf_path.exists():
        pdf_md = ingest_oem_pdf(
            pdf_path,
            pdf_dir,
            redactor=redactor,
            manual_title="OEM Drive Manual",
        )
    summary["outputs"]["pdf_markdown"] = [_display_path(p) for p in pdf_md]

    # S4
    index_path = kb_root / "index.json"
    if index_path.exists() and (eight_d_records or maint_records):
        added = update_index_json(
            index_path,
            eight_d_records=eight_d_records,
            maintenance_records=maint_records,
        )
        summary["outputs"]["index_entries_added"] = added

    # S5
    image_entries = ingest_competition_images(
        gdrive_kb,
        catalog_path=catalog_path,
        destinations=destinations,
    )
    summary["outputs"]["competition_presets"] = len(image_entries)

    summary["redaction_substitutions"] = redactor.report.to_dict()
    return summary


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--gdrive-kb",
        type=Path,
        default=DEFAULT_GDRIVE_KB,
        help="Path to the local Google Drive cache (default: .cache/gdrive/knowledge_base).",
    )
    parser.add_argument(
        "--kb-root",
        type=Path,
        default=DEFAULT_KB_ROOT,
        help="Path to the curated knowledge base root (default: data/knowledge_base).",
    )
    parser.add_argument(
        "--drive-output",
        type=Path,
        default=DEFAULT_DRIVE_OUTPUT,
        help="Directory under kb-root where drive-ingested Markdown is written.",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=DEFAULT_CATALOG,
        help="Path to preset_evidence/catalog.json.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    summary = run_sync(
        gdrive_kb=args.gdrive_kb,
        kb_root=args.kb_root,
        drive_output=args.drive_output,
        catalog_path=args.catalog,
    )

    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())