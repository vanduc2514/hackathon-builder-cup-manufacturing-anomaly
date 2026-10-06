---
name: iam-troubleshooting
metadata:
  version: "1.0.0"
  category: Security
description: >-
  Diagnoses and remediates Google Cloud Identity and Access Management (IAM) permission denials (403 PERMISSION_DENIED).
  Use when encountering access denied errors during Cloud Run deployment, BigQuery queries, Vertex AI / Gemini API calls,
  Firestore blackboard access, or Cloud Storage operations; discovers and binds least-privileged roles.
---

# Google Cloud IAM Troubleshooting & Access Remediation

This skill provides step-by-step diagnostic workflows for identifying and resolving `403 PERMISSION_DENIED` errors across Google Cloud services in the Kaizen Agent platform.

## Architecture Role Matrix for Kaizen Agent

To uphold the principle of least privilege, services and developers must be granted only the specific roles required for their function:

| Principal / Identity | Target Google Cloud Service | Recommended Least-Privilege Role | Purpose |
|---|---|---|---|
| **Cloud Run Backend Service Account** | Vertex AI / Gemini 2.0 | `roles/aiplatform.user` | Invoking Gemini models and RAG corpora with ADC |
| **Cloud Run Backend Service Account** | BigQuery Warehouse | `roles/bigquery.dataViewer`<br/>`roles/bigquery.jobUser` | Reading traceability topology and running query jobs |
| **Cloud Run Backend Service Account** | Cloud Firestore | `roles/datastore.user` | Reading/writing incident documents on the shared blackboard |
| **Cloud Run Backend Service Account** | Cloud Storage | `roles/storage.objectAdmin` | Storing and streaming repair video clips and defect images |
| **Developer / CI/CD Service Account** | Cloud Run | `roles/run.admin`<br/>`roles/iam.serviceAccountUser` | Building and deploying backend container revisions |
| **Developer / CI/CD Service Account** | Firebase Hosting | `roles/firebasehosting.admin` | Deploying dashboard bundle to Firebase CDN |

---

## 1. Diagnostic Flow for Permission Denied (403)

When an operation fails with `403 PERMISSION_DENIED`:

### Step 1: Identify the Calling Principal
Determine whether the command is executing under a user account or service account:
```bash
# Check active gcloud identity
gcloud auth list

# Check active Application Default Credentials (ADC)
gcloud auth application-default print-access-token >/dev/null && echo "ADC is valid"
```

### Step 2: Check IAM Policy Bindings on the Resource
```bash
# For project-level roles
gcloud projects get-iam-policy "${GCP_PROJECT_ID}" \
  --flatten="bindings[].members" \
  --format="table(bindings.role)" \
  --filter="bindings.members:${CALLING_IDENTITY}"

# For BigQuery dataset
bq show --format=prettyjson "${GCP_PROJECT_ID}:manufacturing" | jq .access

# For Cloud Storage bucket
gcloud storage buckets get-iam-policy "gs://kaizen-media-${GCP_PROJECT_ID}"
```

### Step 3: Grant the Missing Least-Privileged Role
Never grant `roles/owner` or `roles/editor`. Apply the exact targeted role:
```bash
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/aiplatform.user"
```

---

## Key References

- **Step-by-Step Resolver Guide**: Investigating Policy Troubleshooter and fixing bindings. See [references/resolver.md](references/resolver.md)
- **Security Guardrails & Prohibited Roles**: Safety boundaries and least-privilege standards. See [references/guardrails.md](references/guardrails.md)
