---
name: vertex-rag-search
metadata:
  version: "1.0.0"
  category: InformationRetrieval
description: >-
  Guides setup, semantic retrieval, and troubleshooting for Vertex AI Search and RAG
  in Kaizen Agent. Use when querying industrial knowledge bases (manuals, 8D reports, SOPs),
  authoring or testing rag_search_tool.py, configuring local vector fallback (data/knowledge_base/),
  or verifying strict citation contracts in agent findings.
---

# Vertex AI Search & RAG Skill

Vertex AI Search (formerly Generative AI App Builder / Discovery Engine) provides enterprise semantic retrieval over unstructured industrial documentation with strict source citations.

## Vertex AI Search & RAG Architecture

- **Service Overview**: Managed semantic search & grounding (formerly Discovery Engine / Generative AI App Builder).
- **Python Client SDK**: `google-cloud-discoveryengine` (`pip install google-cloud-discoveryengine`).
- **Data Stores & Serving Config**: Queries route to serving configs formatted as `projects/{project}/locations/{location}/collections/default_collection/dataStores/{data_store}/servingConfigs/default_search`.
- **Hybrid Search**: Combines keyword search and dense semantic vector embeddings with extractive segments and citations.

## Key Capabilities & References

- **Citation Contract & Schema**: Formatting citations with page numbers, document IDs, and snippets. See [references/citations-contract.md](references/citations-contract.md)

---

## 1. Local Development vs Cloud Parity

In accordance with **Key Invariant 4**, local development functions with zero cloud credentials by reading mock indexed documents directly from the local knowledge base directory.

### Local Mock Retrieval
In the RAG search tool:
- When `GCP_PROJECT_ID` is unset or `APP_ENV=development`, the tool performs local TF-IDF / keyword / vector search over local Markdown and text files in `data/knowledge_base/manuals/` and `data/knowledge_base/past_8d_reports/`.

### Cloud Production Retrieval
In production on Cloud Run:
- Connects to Google Cloud Discovery Engine via `google-cloud-discoveryengine`.
- Data Store ID configured via environment: `VERTEX_DATA_STORE_ID="kaizen-manuals-store"`.
- Application Default Credentials (ADC) handle authentication.

---

## 2. Using the Tool in Code

```python
from backend.tools.rag_search_tool import search_knowledge_base

findings = await search_knowledge_base(
    query="spindle vibration excessive bearing temperature",
    max_results=3,
    filter_machine="CNC-02"
)

for result in findings:
    print(f"[{result.title} p.{result.page_number}]: {result.snippet}")
```

---

## 3. Troubleshooting Guide

| Issue | Cause | Fix |
|---|---|---|
| `Empty search results` | Search query too narrow or vocabulary mismatch | Broaden query terms; include machine type (e.g. `CNC`, `Fanuc`, `lathe`) |
| Missing citations in RCA finding | Agent failed to invoke RAG tool | Ensure `root_cause.py` prompt enforces mandatory citation retrieval |
| Discovery Engine 403 / 404 | Wrong Data Store ID or missing IAM permissions | Check `VERTEX_DATA_STORE_ID` and ensure Service Account has `Discovery Engine Viewer` |
| Local index out of sync | New PDF/manual added to `data/knowledge_base/` | Run `mise run index:rag` to rebuild local search index |
