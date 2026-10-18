"""Upload data/knowledge_base to GCS and import it into the Vertex AI Search datastore."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

KB_ROOT = Path(__file__).resolve().parent.parent / "data" / "knowledge_base"
# Document folders: the curated categories plus the same categories under drive/ (Drive
# knowledge base converted by scripts/sync_gdrive_kb.py). index.json is not a document.
KB_CATEGORIES = ("manuals", "maint_logs", "past_8d_reports")
KB_SOURCES = ("", "drive")
GCS_PREFIX = "kb/"
# Import error logs; outside GCS_PREFIX so they are never imported. Without error_config,
# Discovery Engine creates its own unmanaged *_import_content bucket. Its service agent
# writes here through the project-level roles/discoveryengine.serviceAgent grant.
ERRORS_PREFIX = "import-errors/"
IMPORT_TIMEOUT_SECONDS = 1800


def collect_documents(kb_root: Path = KB_ROOT) -> list[Path]:
    """Returns the Markdown documents of every knowledge-base category, sorted per category."""
    documents: list[Path] = []
    for source in KB_SOURCES:
        for category in KB_CATEGORIES:
            documents.extend(sorted((kb_root / source / category).glob("*.md")))
    return documents


def _blob_name(path: Path, kb_root: Path = KB_ROOT) -> str:
    """Maps <kb_root>/[drive/]<category>/<stem>.md to kb/[drive__]<category>__<stem>.txt."""
    folders = path.relative_to(kb_root).parent.parts
    return f"{GCS_PREFIX}{'__'.join(folders)}__{path.stem}.txt"


def upload_documents(project_id: str, bucket_name: str, files: list[Path]) -> list[str]:
    """Uploads documents as text/plain and deletes stale blobs under the kb/ prefix."""
    from google.cloud import storage

    bucket = storage.Client(project=project_id).bucket(bucket_name)
    uploaded: list[str] = []
    for path in files:
        name = _blob_name(path)
        bucket.blob(name).upload_from_filename(str(path), content_type="text/plain")
        uploaded.append(name)
        logger.info("Uploaded %s -> gs://%s/%s", path.relative_to(KB_ROOT), bucket_name, name)

    keep = set(uploaded)
    for blob in bucket.list_blobs(prefix=GCS_PREFIX):
        if blob.name not in keep:
            blob.delete()
            logger.info("Deleted stale gs://%s/%s", bucket_name, blob.name)

    return uploaded


def import_documents(project_id: str, location: str, datastore_id: str, bucket_name: str) -> None:
    """Runs a FULL reconciliation import of gs://<bucket>/kb/* into the datastore."""
    from google.cloud import discoveryengine_v1 as discoveryengine

    client_options = (
        None
        if location == "global"
        else {"api_endpoint": f"{location}-discoveryengine.googleapis.com"}
    )
    client = discoveryengine.DocumentServiceClient(client_options=client_options)
    parent = client.branch_path(project_id, location, datastore_id, "default_branch")
    request = discoveryengine.ImportDocumentsRequest(
        parent=parent,
        gcs_source=discoveryengine.GcsSource(
            input_uris=[f"gs://{bucket_name}/{GCS_PREFIX}*"],
            data_schema="content",
        ),
        reconciliation_mode=discoveryengine.ImportDocumentsRequest.ReconciliationMode.FULL,
        error_config=discoveryengine.ImportErrorConfig(
            gcs_prefix=f"gs://{bucket_name}/{ERRORS_PREFIX}"
        ),
    )

    logger.info("Importing gs://%s/%s* into %s", bucket_name, GCS_PREFIX, parent)
    operation = client.import_documents(request=request)
    response = operation.result(timeout=IMPORT_TIMEOUT_SECONDS)

    if response.error_samples:
        for sample in response.error_samples:
            logger.error("Import error: %s", sample.message)
        raise RuntimeError("Knowledge base import reported errors")

    metadata = operation.metadata
    logger.info(
        "Knowledge base import finished: success=%s failure=%s",
        metadata.success_count,
        metadata.failure_count,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project",
        default=settings.gcp_project_id,
        help="GCP Project ID (default: settings.gcp_project_id)",
    )
    parser.add_argument("--bucket", required=True, help="GCS staging bucket (terraform kb_bucket)")
    parser.add_argument(
        "--datastore",
        default=settings.vertex_search_datastore_id,
        help="Vertex AI Search datastore ID (default: settings.vertex_search_datastore_id)",
    )
    parser.add_argument(
        "--location",
        default=settings.vertex_search_location,
        help="Vertex AI Search location (default: settings.vertex_search_location)",
    )
    args = parser.parse_args()

    documents = collect_documents()
    if not documents:
        logger.error("No knowledge base documents found under %s", KB_ROOT)
        sys.exit(1)

    try:
        upload_documents(args.project, args.bucket, documents)
        import_documents(args.project, args.location, args.datastore, args.bucket)
    except Exception as exc:
        logger.error("Knowledge base import failed: %s", exc)
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
