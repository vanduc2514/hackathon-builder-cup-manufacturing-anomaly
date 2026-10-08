"""ADK Tool: Direct rclone / Google Drive connector for external knowledge base access."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional

from backend.core.config import settings
from backend.core.models import GoogleDriveDocument

logger = logging.getLogger(__name__)


class GoogleDriveConnector:
    """Direct connector to external Google Drive storage via rclone.

    Allows streaming and pulling knowledge base files directly from the canonical
    remote (e.g. `gdrive:💻 Competition | AI Builder Cup`) without requiring them
    to be checked into git.
    """

    def __init__(
        self,
        remote: Optional[str] = None,
        base_folder: Optional[str] = None,
        cache_dir: Optional[str | Path] = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.remote = remote or settings.gdrive_remote
        self.base_folder = base_folder or settings.gdrive_base_folder
        self.cache_dir = Path(cache_dir or settings.gdrive_cache_dir)
        self.timeout = timeout_seconds

    def _resolve_rclone_bin(self) -> Optional[str]:
        """Find the rclone binary on PATH or standard mise/local directories."""
        found = shutil.which("rclone")
        if found:
            return found

        # Fallback candidate locations
        home = Path.home()
        candidates = [
            home / ".local/share/mise/installs/rclone/1.75.1/bin/rclone",
            home / ".local/bin/rclone",
            Path("/usr/local/bin/rclone"),
            Path("/opt/homebrew/bin/rclone"),
        ]
        for c in candidates:
            if c.is_file() and os.access(c, os.X_OK):
                return str(c)
        return None

    def is_available(self) -> bool:
        """Check if rclone is installed and the configured remote exists."""
        rclone_bin = self._resolve_rclone_bin()
        if not rclone_bin:
            logger.debug("rclone binary not found")
            return False

        try:
            res = subprocess.run(
                [rclone_bin, "listremotes"],
                capture_output=True,
                text=True,
                timeout=5.0,
                check=False,
            )
            if res.returncode != 0:
                return False
            expected_remote = f"{self.remote}:"
            return any(line.strip() == expected_remote for line in res.stdout.splitlines())
        except Exception as exc:
            logger.debug("rclone listremotes check failed: %s", exc)
            return False

    def _format_remote_target(self, subpath: str = "") -> str:
        """Construct rclone remote path target string."""
        clean_subpath = subpath.strip("/")
        if clean_subpath:
            return f"{self.remote}:{self.base_folder}/{clean_subpath}"
        return f"{self.remote}:{self.base_folder}"

    def list_documents(
        self, subfolder: str = "", recursive: bool = False
    ) -> List[GoogleDriveDocument]:
        """List files and folders directly from Google Drive via rclone lsjson."""
        rclone_bin = self._resolve_rclone_bin()
        if not rclone_bin:
            logger.warning("rclone not found; cannot list remote Google Drive files")
            return []

        target = self._format_remote_target(subfolder)
        cmd = [rclone_bin, "lsjson", target, "--drive-shared-with-me"]
        if recursive:
            cmd.append("-R")

        try:
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                check=False,
            )
            if res.returncode != 0:
                logger.warning("rclone lsjson failed (%s): %s", res.returncode, res.stderr)
                return []

            raw_data = json.loads(res.stdout)
            documents: List[GoogleDriveDocument] = []
            for item in raw_data:
                if not isinstance(item, dict):
                    continue
                path = item.get("Path") or item.get("Name", "")
                full_rel_path = f"{subfolder.strip('/')}/{path}".strip("/") if subfolder else path
                documents.append(
                    GoogleDriveDocument(
                        path=full_rel_path,
                        name=item.get("Name", ""),
                        size_bytes=int(item.get("Size", 0)),
                        is_dir=bool(item.get("IsDir", False)),
                        mime_type=item.get("MimeType"),
                        mod_time=item.get("ModTime"),
                    )
                )
            return documents
        except Exception as exc:
            logger.warning("Failed to list Google Drive documents: %s", exc)
            return []

    def stream_document_bytes(self, remote_path: str) -> bytes:
        """Stream raw file content directly from Google Drive without local file creation."""
        rclone_bin = self._resolve_rclone_bin()
        if not rclone_bin:
            raise RuntimeError("rclone binary not available to stream Google Drive file")

        target = self._format_remote_target(remote_path)
        cmd = [rclone_bin, "cat", target, "--drive-shared-with-me"]

        try:
            res = subprocess.run(
                cmd,
                capture_output=True,
                timeout=self.timeout,
                check=False,
            )
            if res.returncode != 0:
                err_msg = res.stderr.decode("utf-8", errors="replace")
                raise RuntimeError(
                    f"rclone cat failed for '{target}' (code {res.returncode}): {err_msg}"
                )
            return res.stdout
        except Exception as exc:
            logger.error("Error streaming Google Drive document '%s': %s", remote_path, exc)
            raise RuntimeError(f"Google Drive streaming error for '{remote_path}': {exc}") from exc

    def stream_document_text(
        self, remote_path: str, encoding: str = "utf-8", errors: str = "replace"
    ) -> str:
        """Stream document as text string."""
        raw_bytes = self.stream_document_bytes(remote_path)
        return raw_bytes.decode(encoding, errors=errors)

    def fetch_to_cache(self, remote_path: str, force_refresh: bool = False) -> Path:
        """Fetch remote document to local cache directory (.cache/gdrive) and return its Path."""
        clean_rel = remote_path.lstrip("/")
        dest_path = self.cache_dir / clean_rel

        if dest_path.is_file() and not force_refresh:
            return dest_path

        dest_path.parent.mkdir(parents=True, exist_ok=True)
        content = self.stream_document_bytes(remote_path)
        dest_path.write_bytes(content)
        return dest_path

    def sync_folder(self, subfolder: str = "", local_target: Optional[Path] = None) -> Path:
        """Download or sync remote folder directly into local cache directory without git commit."""
        rclone_bin = self._resolve_rclone_bin()
        if not rclone_bin:
            raise RuntimeError("rclone binary not available to sync Google Drive folder")

        target_dir = local_target or (self.cache_dir / subfolder.strip("/"))
        target_dir.mkdir(parents=True, exist_ok=True)

        remote_source = self._format_remote_target(subfolder)
        cmd = [
            rclone_bin,
            "copy",
            remote_source,
            str(target_dir),
            "--drive-shared-with-me",
            "--drive-export-formats",
            "md,csv",
        ]

        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=self.timeout * 2,
            check=False,
        )
        if res.returncode != 0:
            raise RuntimeError(f"rclone copy failed: {res.stderr}")
        return target_dir

    # -------------------------------------------------------------------------
    # Asynchronous methods
    # -------------------------------------------------------------------------

    async def list_documents_async(
        self, subfolder: str = "", recursive: bool = False
    ) -> List[GoogleDriveDocument]:
        """Asynchronously list remote documents."""
        return await asyncio.to_thread(self.list_documents, subfolder, recursive)

    async def stream_document_bytes_async(self, remote_path: str) -> bytes:
        """Asynchronously stream raw document bytes."""
        return await asyncio.to_thread(self.stream_document_bytes, remote_path)

    async def stream_document_text_async(
        self, remote_path: str, encoding: str = "utf-8", errors: str = "replace"
    ) -> str:
        """Asynchronously stream document text."""
        return await asyncio.to_thread(self.stream_document_text, remote_path, encoding, errors)

    async def fetch_to_cache_async(self, remote_path: str, force_refresh: bool = False) -> Path:
        """Asynchronously fetch document to cache."""
        return await asyncio.to_thread(self.fetch_to_cache, remote_path, force_refresh)

    async def sync_folder_async(
        self, subfolder: str = "", local_target: Optional[Path] = None
    ) -> Path:
        """Asynchronously sync folder to local cache."""
        return await asyncio.to_thread(self.sync_folder, subfolder, local_target)


# Module-level singleton
gdrive_connector = GoogleDriveConnector()


def list_gdrive_documents(
    subfolder: str = "", recursive: bool = False
) -> List[GoogleDriveDocument]:
    """Helper to list Google Drive documents using default connector."""
    return gdrive_connector.list_documents(subfolder=subfolder, recursive=recursive)


def stream_gdrive_document(remote_path: str) -> bytes:
    """Helper to stream Google Drive document bytes."""
    return gdrive_connector.stream_document_bytes(remote_path)


def stream_gdrive_document_text(remote_path: str) -> str:
    """Helper to stream Google Drive document text."""
    return gdrive_connector.stream_document_text(remote_path)


def fetch_gdrive_document(remote_path: str, force_refresh: bool = False) -> Path:
    """Helper to fetch Google Drive document into local cache."""
    return gdrive_connector.fetch_to_cache(remote_path, force_refresh=force_refresh)


def sync_gdrive_knowledge_base(subfolder: str = "knowledge base") -> Path:
    """Helper to pull external knowledge base files into cache for offline indexing."""
    return gdrive_connector.sync_folder(subfolder=subfolder)
