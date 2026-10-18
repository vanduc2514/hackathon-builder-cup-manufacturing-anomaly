"""Tests for scripts/import_knowledge_base.py document collection and blob naming."""

from __future__ import annotations

from pathlib import Path

from scripts.import_knowledge_base import _blob_name, _is_stale, collect_documents


def _touch(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("# doc\n", encoding="utf-8")
    return path


def test_collect_documents_includes_drive_categories(tmp_path: Path) -> None:
    curated = _touch(tmp_path / "manuals" / "cnc_operating_manual.md")
    drive = _touch(tmp_path / "drive" / "maint_logs" / "ML-SYN-0001.md")
    _touch(tmp_path / "expert_videos" / "notes.md")

    documents = collect_documents(tmp_path)

    assert documents == [curated, drive]


def test_blob_names_keep_drive_documents_distinct(tmp_path: Path) -> None:
    curated = tmp_path / "past_8d_reports" / "8D_a.md"
    drive = tmp_path / "drive" / "past_8d_reports" / "8D_a.md"

    assert _blob_name(curated, tmp_path) == "kb/past_8d_reports__8D_a.txt"
    assert _blob_name(drive, tmp_path) == "kb/drive__past_8d_reports__8D_a.txt"


def test_repository_knowledge_base_has_drive_documents() -> None:
    names = {path.as_posix() for path in collect_documents()}
    assert any("/drive/maint_logs/" in name for name in names)
    assert any("/drive/manuals/" in name for name in names)
    assert any("/drive/past_8d_reports/" in name for name in names)


def test_reconciliation_keeps_learned_blobs() -> None:
    """kb:import reconciliation never deletes Continuous Learning write-back blobs."""
    keep = {"kb/manuals__foo.txt"}

    # Learned write-back blobs survive even though this importer never uploads them
    assert _is_stale("kb/learned__INC-0412.txt", keep) is False
    assert _is_stale("kb/learned__INC-0412.txt", set()) is False
    # Unmanaged curated blobs are still reconciled away
    assert _is_stale("kb/manuals__bar.txt", keep) is True
    # Managed blobs are kept
    assert _is_stale("kb/manuals__foo.txt", keep) is False


def test_learned_blob_name_matches_reconciliation_keep_prefix() -> None:
    """The write-back blob name lands inside the kb/learned__ prefix kb:import keeps."""
    from backend.tools.learning_writeback import learned_blob_name

    name = learned_blob_name("INC-0412")
    assert name == "kb/learned__INC-0412.txt"
    assert _is_stale(name, set()) is False
