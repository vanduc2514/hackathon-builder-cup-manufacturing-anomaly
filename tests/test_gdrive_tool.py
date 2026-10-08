"""Unit tests for GoogleDriveConnector and Google Drive knowledge base RAG integration."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend.core.models import GoogleDriveDocument, RAGSearchResult
from backend.tools.gdrive_tool import (
    GoogleDriveConnector,
)
from backend.tools.rag_search_tool import (
    search_gdrive_knowledge,
    search_gdrive_knowledge_base,
    search_knowledge_base_sync,
)


@pytest.fixture
def mock_connector(tmp_path: Path) -> GoogleDriveConnector:
    """Fixture providing a GoogleDriveConnector pointed to temporary cache."""
    return GoogleDriveConnector(
        remote="test-remote",
        base_folder="Test Folder",
        cache_dir=tmp_path / "cache",
        timeout_seconds=5.0,
    )


def test_connector_initialization(mock_connector: GoogleDriveConnector, tmp_path: Path):
    """Verifies connector initialization and default attribute values."""
    assert mock_connector.remote == "test-remote"
    assert mock_connector.base_folder == "Test Folder"
    assert mock_connector.cache_dir == tmp_path / "cache"
    assert mock_connector.timeout == 5.0


def test_connector_availability_missing_binary(mock_connector: GoogleDriveConnector):
    """Verifies is_available returns False when rclone binary is missing."""
    with patch.object(mock_connector, "_resolve_rclone_bin", return_value=None):
        assert mock_connector.is_available() is False


def test_connector_availability_success(mock_connector: GoogleDriveConnector):
    """Verifies is_available returns True when remote is listed in rclone listremotes."""
    with patch.object(mock_connector, "_resolve_rclone_bin", return_value="/mock/rclone"):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="other-remote:\ntest-remote:\n",
            )
            assert mock_connector.is_available() is True


def test_connector_availability_remote_not_found(mock_connector: GoogleDriveConnector):
    """Verifies is_available returns False when remote is not listed."""
    with patch.object(mock_connector, "_resolve_rclone_bin", return_value="/mock/rclone"):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="other-remote:\nsome-other:\n",
            )
            assert mock_connector.is_available() is False


def test_list_documents(mock_connector: GoogleDriveConnector):
    """Verifies parsing of rclone lsjson output into GoogleDriveDocument models."""
    sample_json = json.dumps(
        [
            {
                "Path": "manuals/cnc_spec.pdf",
                "Name": "cnc_spec.pdf",
                "Size": 10240,
                "IsDir": False,
                "MimeType": "application/pdf",
                "ModTime": "2026-03-12T10:00:00Z",
            },
            {
                "Path": "manuals",
                "Name": "manuals",
                "Size": 0,
                "IsDir": True,
                "MimeType": "inode/directory",
                "ModTime": "2026-03-12T09:00:00Z",
            },
        ]
    )

    with patch.object(mock_connector, "_resolve_rclone_bin", return_value="/mock/rclone"):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout=sample_json)

            docs = mock_connector.list_documents(subfolder="knowledge base", recursive=True)

            assert len(docs) == 2
            doc1, doc2 = docs[0], docs[1]
            assert isinstance(doc1, GoogleDriveDocument)
            assert doc1.name == "cnc_spec.pdf"
            assert doc1.path == "knowledge base/manuals/cnc_spec.pdf"
            assert doc1.size_bytes == 10240
            assert doc1.is_dir is False

            assert doc2.is_dir is True


def test_list_documents_failure_returns_empty(mock_connector: GoogleDriveConnector):
    """Verifies list_documents returns an empty list on subprocess failure."""
    with patch.object(mock_connector, "_resolve_rclone_bin", return_value="/mock/rclone"):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stderr="Remote error")
            docs = mock_connector.list_documents()
            assert docs == []


def test_stream_document_bytes_and_text(mock_connector: GoogleDriveConnector):
    """Verifies streaming raw bytes and decoded text directly from Google Drive."""
    content = b"### CNC VMC-850 Operating Manual\nSpindle runout limit is 0.005mm."

    with patch.object(mock_connector, "_resolve_rclone_bin", return_value="/mock/rclone"):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout=content)

            raw_bytes = mock_connector.stream_document_bytes("manuals/cnc.md")
            assert raw_bytes == content

            text = mock_connector.stream_document_text("manuals/cnc.md")
            assert "Spindle runout limit" in text


def test_stream_document_error_raises_runtime_error(mock_connector: GoogleDriveConnector):
    """Verifies stream_document_bytes raises RuntimeError on failure."""
    with patch.object(mock_connector, "_resolve_rclone_bin", return_value="/mock/rclone"):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stderr=b"File not found")
            with pytest.raises(RuntimeError, match="rclone cat failed"):
                mock_connector.stream_document_bytes("nonexistent.md")


def test_fetch_to_cache(mock_connector: GoogleDriveConnector, tmp_path: Path):
    """Verifies fetching remote document to local cache directory."""
    content = b"Test file cache content"

    with patch.object(mock_connector, "_resolve_rclone_bin", return_value="/mock/rclone"):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout=content)

            cached_path = mock_connector.fetch_to_cache("knowledge base/guide.md")
            assert cached_path.is_file()
            assert cached_path.read_bytes() == content

            # Second call should reuse cached file without invoking subprocess
            mock_run.reset_mock()
            reused_path = mock_connector.fetch_to_cache("knowledge base/guide.md")
            assert reused_path == cached_path
            mock_run.assert_not_called()

            # Force refresh triggers re-download
            refreshed_path = mock_connector.fetch_to_cache(
                "knowledge base/guide.md", force_refresh=True
            )
            assert refreshed_path == cached_path
            mock_run.assert_called_once()


def test_sync_folder(mock_connector: GoogleDriveConnector, tmp_path: Path):
    """Verifies sync_folder executes rclone copy to local destination."""
    target_dir = tmp_path / "sync_target"

    with patch.object(mock_connector, "_resolve_rclone_bin", return_value="/mock/rclone"):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stderr="")
            res_dir = mock_connector.sync_folder("knowledge base", local_target=target_dir)
            assert res_dir == target_dir
            assert target_dir.is_dir()
            mock_run.assert_called_once()


def test_async_connector_methods(mock_connector: GoogleDriveConnector):
    """Verifies async wrapper methods execute asynchronously."""

    async def _run():
        with patch.object(mock_connector, "list_documents", return_value=[]):
            docs = await mock_connector.list_documents_async()
            assert docs == []

        with patch.object(mock_connector, "stream_document_bytes", return_value=b"async bytes"):
            content = await mock_connector.stream_document_bytes_async("doc.txt")
            assert content == b"async bytes"

        with patch.object(mock_connector, "stream_document_text", return_value="async text"):
            text = await mock_connector.stream_document_text_async("doc.txt")
            assert text == "async text"

    asyncio.run(_run())


def test_search_gdrive_knowledge_success(mock_connector: GoogleDriveConnector):
    """Verifies RAG search over Google Drive documents with dual keys."""
    mock_files = [
        GoogleDriveDocument(
            path="knowledge base/cnc_vmc850_manual.md",
            name="cnc_vmc850_manual.md",
            size_bytes=5000,
            is_dir=False,
            mod_time="2026-03-12T10:00:00Z",
        )
    ]
    preview_content = "CNC-02 VMC-850 Manual: High scratch_vertical defects occur when tool T07 wear exceeds 0.2mm."

    with patch.object(mock_connector, "list_documents", return_value=mock_files):
        with patch.object(mock_connector, "stream_document_text", return_value=preview_content):
            result = search_gdrive_knowledge(
                defect_symptom="scratch_vertical",
                suspect_asset="CNC-02",
                query="tool wear insert",
                connector=mock_connector,
            )

            assert isinstance(result, RAGSearchResult)
            assert result.engine == "google_drive"
            assert len(result.citations) == 1
            citation = result.citations[0]
            assert "cnc_vmc850_manual.md" in citation.title
            assert citation.document_id == "gdrive://knowledge base/cnc_vmc850_manual.md"
            assert citation.relevance_score > 0.50
            assert result.confidence > 0.50


def test_search_gdrive_knowledge_empty_guardrail(mock_connector: GoogleDriveConnector):
    """Verifies anti-hallucination guardrail returns confidence 0.0 when no matching documents."""
    with patch.object(mock_connector, "list_documents", return_value=[]):
        result = search_gdrive_knowledge(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
            connector=mock_connector,
        )

        assert isinstance(result, RAGSearchResult)
        assert len(result.citations) == 0
        assert result.confidence == 0.0
        assert "No verified Google Drive documents" in (result.summary or "")


def test_search_knowledge_base_sync_with_gdrive_source(mock_connector: GoogleDriveConnector):
    """Verifies search_knowledge_base_sync delegates to Google Drive when source='google_drive'."""
    with patch("backend.tools.rag_search_tool.search_gdrive_knowledge") as mock_search_gdrive:
        mock_search_gdrive.return_value = RAGSearchResult(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
            query="scratch_vertical CNC-02",
            citations=[],
            confidence=0.0,
            engine="google_drive",
            total_found=0,
        )

        result = search_knowledge_base_sync(
            defect_symptom="scratch_vertical",
            suspect_asset="CNC-02",
            source="google_drive",
        )

        assert result.engine == "google_drive"
        mock_search_gdrive.assert_called_once()


def test_search_gdrive_knowledge_base_async():
    """Verifies asynchronous search_gdrive_knowledge_base helper."""

    async def _run():
        with patch("backend.tools.rag_search_tool.search_gdrive_knowledge") as mock_search:
            mock_search.return_value = RAGSearchResult(
                defect_symptom="short_fill",
                suspect_asset="IM-05",
                query="short_fill IM-05",
                citations=[],
                confidence=0.0,
                engine="google_drive",
                total_found=0,
            )

            res = await search_gdrive_knowledge_base(
                defect_symptom="short_fill",
                suspect_asset="IM-05",
            )
            assert res.engine == "google_drive"

    asyncio.run(_run())
