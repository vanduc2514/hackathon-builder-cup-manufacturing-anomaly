"""ADK Tool: Executes queries against BigQuery for discrete traceability topology and continuous sensor streams."""

import csv
import os

MOCK_TRACEABILITY_PATH = "data/datasets/mock_traceability.csv"


def seed_mock_data():
    """Generates mock traceability dataset for the 3 CNC machines."""
    os.makedirs(os.path.dirname(MOCK_TRACEABILITY_PATH), exist_ok=True)
    rows = [
        ["product_id", "timestamp", "machine_id", "tool_id", "lot_id", "operator_id", "status"],
        ["PRD-1001", "2026-10-05T09:20:00", "CNC-01", "T04", "AL-5083-B4", "OP-12", "PASS"],
        ["PRD-1002", "2026-10-05T09:25:00", "CNC-03", "T07", "AL-5083-B4", "OP-08", "PASS"],
        ["PRD-1003", "2026-10-05T09:35:00", "CNC-02", "T07", "AL-5083-B4", "OP-15", "PASS"],
        ["PRD-1004", "2026-10-05T09:40:00", "CNC-02", "T07", "AL-5083-B4", "OP-15", "DEFECT_SCRATCH"],
        ["PRD-1005", "2026-10-05T09:42:00", "CNC-02", "T07", "AL-5083-B4", "OP-15", "DEFECT_SCRATCH"],
        ["PRD-1006", "2026-10-05T09:44:00", "CNC-01", "T04", "AL-5083-B4", "OP-12", "PASS"],
        ["PRD-1007", "2026-10-05T09:45:00", "CNC-02", "T07", "AL-5083-B4", "OP-15", "DEFECT_SCRATCH"],
    ]
    with open(MOCK_TRACEABILITY_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    print(f"Seeded mock traceability data at: {MOCK_TRACEABILITY_PATH}")


def query_traceability_topology(time_window: str = "09:30-10:00") -> dict:
    """Mock BigQuery query returning suspect rankings based on discrete topology diff."""
    return {
        "suspects": [
            {"machine_id": "CNC-02", "tool_id": "T07", "correlation_score": 0.95},
            {"machine_id": "CNC-01", "tool_id": "T04", "correlation_score": 0.02},
            {"machine_id": "CNC-03", "tool_id": "T07", "correlation_score": 0.01}
        ],
        "excluded_factors": ["lot_id: AL-5083-B4 (normal on CNC-01/03)"]
    }
