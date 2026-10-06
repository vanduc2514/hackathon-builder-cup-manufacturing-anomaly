# Cloud Storage Python Client Library Guide

The `google-cloud-storage` package provides idiomatic Python APIs for uploading, downloading, and streaming objects.

## Installation

```bash
pip install google-cloud-storage
```

## Initializing Client

In Google Cloud Run or with `gcloud auth application-default login`, the client automatically initializes with Application Default Credentials (ADC):

```python
from google.cloud import storage

client = storage.Client()
```

---

## Uploading Inspection Video / Images

```python
from pathlib import Path
from google.cloud import storage

def upload_defect_frame(
    local_path: str,
    bucket_name: str = "kaizen-media-prod",
    prefix: str = "defects"
) -> str:
    """Uploads a defect image frame and returns the public or gs:// URI."""
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    
    file_name = Path(local_path).name
    blob = bucket.blob(f"{prefix}/{file_name}")
    
    blob.upload_from_filename(local_path, content_type="image/jpeg")
    return f"gs://{bucket_name}/{prefix}/{file_name}"
```

---

## Generating Signed URLs for Client-Side Direct Uploads

Technicians can upload repair SOP videos directly from their smartphone browser without routing 50MB+ video payloads through the Cloud Run backend:

```python
import datetime
from google.cloud import storage

def generate_upload_signed_url_v4(
    bucket_name: str,
    blob_name: str,
    expiration_minutes: int = 15
) -> str:
    """Generates a v4 signed URL for uploading a blob via HTTP PUT."""
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)

    url = blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=expiration_minutes),
        method="PUT",
        content_type="video/mp4",
    )
    return url
```

---

## Streaming Download to Memory (for Gemini Vision / Video)

```python
from google.cloud import storage

def read_blob_bytes(bucket_name: str, blob_name: str) -> bytes:
    """Downloads a blob directly into memory bytes without writing to disk."""
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    return blob.download_as_bytes()
```
