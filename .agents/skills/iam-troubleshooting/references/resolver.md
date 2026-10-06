# IAM Access Resolver Guide

Follow this systematic guide when investigating and remediating access denials for Google Cloud services in Kaizen Agent.

## Common Error Patterns & Solutions

### 1. Cloud Run Deployment: `iam.serviceAccounts.actAs` Denied
- **Symptom**: `gcloud run deploy` fails with:
  ```
  ERROR: (gcloud.run.deploy) User [user@example.com] does not have permission to act as service account [kaizen-backend-sa@...].
  ```
- **Cause**: The deploying user or CI pipeline lacks permission to attach the runtime service account to Cloud Run.
- **Remediation**:
  ```bash
  gcloud iam service-accounts add-iam-policy-binding \
    "kaizen-backend-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --member="user:user@example.com" \
    --role="roles/iam.serviceAccountUser"
  ```

---

### 2. BigQuery: `Access Denied: Table manufacturing.traceability: User does not have permission`
- **Symptom**: Querying BigQuery from FastAPI backend fails with `403 Access Denied`.
- **Cause**: Service account lacks dataset reading or job running rights.
- **Remediation**:
  ```bash
  # 1. Grant project-level job running permission
  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/bigquery.jobUser"

  # 2. Grant dataset-level data viewer permission
  bq add-iam-policy-binding \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/bigquery.dataViewer" \
    "${GCP_PROJECT_ID}:manufacturing"
  ```

---

### 3. Vertex AI: `aiplatform.endpoints.predict` Denied
- **Symptom**: Calling Gemini 2.0 or Vertex Search fails with `403 Permission aiplatform.endpoints.predict denied`.
- **Cause**: Missing Vertex AI user role on the calling identity.
- **Remediation**:
  ```bash
  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/aiplatform.user"
  ```

---

### 4. Firestore Blackboard: `Missing or insufficient permissions`
- **Symptom**: Writing an agent finding to Firestore yields `PERMISSION_DENIED`.
- **Cause**: Service account lacks datastore user role.
- **Remediation**:
  ```bash
  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/datastore.user"
  ```
