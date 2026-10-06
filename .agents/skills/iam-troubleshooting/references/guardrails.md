# IAM Security Guardrails & Best Practices

To protect industrial manufacturing data, prevent accidental outages, and maintain SOC2 / ISO27001 readiness, adhere to these guardrails:

## 1. Prohibited Roles in Production

Never assign primitive/broad roles to application service accounts:
- ❌ **`roles/owner`**: Grants complete control, including IAM policy alteration and project deletion.
- ❌ **`roles/editor`**: Grants modifying rights across all GCP services.
- ❌ **`roles/storage.admin`** at project level: Grants right to delete all buckets in the project.

Instead, always assign predefined granular roles scoped to the specific resource (dataset, bucket, or service).

## 2. No Service Account Keys in Source Control

- Never create or commit `.json` service account key files into git.
- In local development: use `gcloud auth application-default login`.
- In Cloud Run: use IAM Workload Identity with attached service accounts.
- In CI/CD (GitHub Actions): use GitHub OIDC Workload Identity Federation instead of long-lived service account keys.

## 3. Separation of Duties

- **Runtime Identity**: Cloud Run service account has data access (`roles/bigquery.dataViewer`, `roles/aiplatform.user`), but **zero administrative deployment rights**.
- **Deployment Identity**: GitHub Actions / CI pipeline has deployment access (`roles/run.admin`, `roles/iam.serviceAccountUser`), but **no direct access to production customer data**.
