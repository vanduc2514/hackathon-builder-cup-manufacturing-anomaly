# Cloud Storage Core Concepts for Kaizen Agent

## 1. Bucket Naming & Namespace

- Bucket names exist in a **single global namespace** shared across all Google Cloud customers.
- Best practice: Prefix bucket names with the project ID or organization namespace:
  - `gs://kaizen-media-${PROJECT_ID}`
  - `gs://kaizen-knowledge-${PROJECT_ID}`

## 2. Bucket Locations & Co-Location

Always co-locate Cloud Storage buckets in the same region as the Cloud Run backend (`asia-southeast1`):
- **Zero Egress Cost**: Data transferred between Cloud Storage and Cloud Run in the same Google Cloud region incurs $0 network egress.
- **Ultra-Low Latency**: Sub-10ms response times for video streaming and image retrieval.

## 3. Storage Classes

| Storage Class | Minimum Retention | Best For |
|---|---|---|
| **Standard** | None | Real-time defect images, active SOP videos, frequently accessed RAG manuals |
| **Nearline** | 30 days | Archived inspection captures older than 30 days |
| **Coldline** | 90 days | Historical 8D incident bundles kept for regulatory compliance |
| **Archive** | 365 days | Long-term raw sensor dumps |

### Object Lifecycle Management
Automatically transition old defect images to Nearline after 30 days using a lifecycle rule:
```json
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
      "condition": {"age": 30}
    }
  ]
}
```

## 4. Uniform Bucket-Level Access (UBLA)

Always enable **Uniform Bucket-Level Access**. This disables legacy per-object ACLs and uses Google Cloud IAM exclusively. It prevents accidental public leakage and simplifies security audits.
