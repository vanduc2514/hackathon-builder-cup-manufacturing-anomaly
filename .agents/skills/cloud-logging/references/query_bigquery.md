# Querying BigQuery Logs in Cloud Logging

BigQuery query jobs and administrative actions generate entries in Cloud Logging under Cloud Audit Logs.

## Identifying BigQuery Resources

- **Resource Types**: `bigquery_project`, `bigquery_dataset`
- **Audit Log Name**: `logName=~"cloudaudit.googleapis.com%2Fdata_access"`

---

## Practical BigQuery LQL Recipes

### 1. Failed BigQuery Queries
```lql
resource.type="bigquery_project"
AND protoPayload.serviceName="bigquery.googleapis.com"
AND protoPayload.status.code != 0
```

### 2. High-Scan Queries (> 1 GB Billed)
```lql
resource.type="bigquery_project"
AND protoPayload.serviceData.jobCompletedEvent.job.jobStatistics.totalBilledBytes > 1073741824
```

### 3. Traceability Query Execution Traces
```lql
resource.type="bigquery_project"
AND protoPayload.serviceData.jobCompletedEvent.job.jobConfiguration.query.query=~"manufacturing.traceability"
```

### 4. DDL Table Alterations & Creations
```lql
resource.type="bigquery_project"
AND protoPayload.methodName="google.cloud.bigquery.v2.TableService.InsertTable"
```
