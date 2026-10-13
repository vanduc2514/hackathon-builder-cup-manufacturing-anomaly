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
# Tracked document folders; drive/ is a gitignored duplicate and index.json is not a document.
KB_CATEGORIES = ("manuals", "maint_logs", "past_8d_reports")
GCS_PREFIX = "kb/"
IMPORT_TIMEOUT_SECONDS = 1800


def collect_documents(kb_root: Path = KB_ROOT) -> list[Path]:
    """Returns the Markdown documents of every knowledge-base category, sorted per category."""
    documents: list[Path] = []
    for category in KB_CATEGORIES:
        documents.extend(sorted((kb_root / category).glob("*.md")))
    return documents


def _blob_name(path: Path) -> str:
    """Maps data/knowledge_base/<category>/<stem>.md to kb/<category>__<stem>.txt."""
    return f"{GCS_PREFIX}{path.parent.name}__{path.stem}.txt"


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
