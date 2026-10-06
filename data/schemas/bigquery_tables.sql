-- =============================================================================
-- BigQuery DDL Schemas for Kaizen Agent
-- Dataset: manufacturing
-- Compatible with live BigQuery and goccy/bigquery-emulator
-- =============================================================================

CREATE TABLE IF NOT EXISTS `manufacturing.traceability` (
    product_id STRING NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    machine_id STRING NOT NULL,
    tool_id STRING NOT NULL,
    lot_id STRING NOT NULL,
    operator_id STRING NOT NULL,
    status STRING NOT NULL
);

CREATE TABLE IF NOT EXISTS `manufacturing.sensor_telemetry` (
    timestamp TIMESTAMP NOT NULL,
    machine_id STRING NOT NULL,
    vibration_mm_s FLOAT64,
    temperature_c FLOAT64,
    current_a FLOAT64,
    spindle_speed_rpm INT64
);

CREATE TABLE IF NOT EXISTS `manufacturing.sustainability_impact` (
    incident_id STRING NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    scrap_pieces_avoided INT64,
    co2_kg_saved FLOAT64,
    downtime_minutes_saved FLOAT64,
    energy_kwh_saved FLOAT64
);
