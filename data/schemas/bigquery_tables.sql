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

-- -----------------------------------------------------------------------------
-- TKT-070 / issue #268 — Competition asset telemetry (1-Hz CSV replay dataset)
-- Mirrors the nested AI-sensor-spec.md envelope as a flat warehouse table so
-- that analytical queries (per-machine distributions, anomaly score histograms)
-- can run over both the in-process emulator and live BigQuery without changing
-- the SQL surface.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `manufacturing.competition_telemetry` (
    asset_factory_id STRING NOT NULL,
    asset_line_id STRING NOT NULL,
    asset_machine_id STRING NOT NULL,
    operating_status STRING NOT NULL,
    operating_load_percent FLOAT64,
    operating_runtime_hours FLOAT64,
    sensor_temperature FLOAT64,
    sensor_vibration FLOAT64,
    sensor_rpm INT64,
    sensor_current FLOAT64,
    health_anomaly_score FLOAT64,
    alarm_code INT64,
    warning_code INT64,
    fan_status BOOL,
    timestamp TIMESTAMP NOT NULL
);

-- Migration safety: ADD COLUMN IF NOT EXISTS for any future field additions,
-- keeping the table in sync across live BigQuery and emulator instances that
-- were created before the new column existed.
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS asset_factory_id STRING;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS asset_line_id STRING;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS asset_machine_id STRING;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS operating_status STRING;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS operating_load_percent FLOAT64;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS operating_runtime_hours FLOAT64;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS sensor_temperature FLOAT64;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS sensor_vibration FLOAT64;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS sensor_rpm INT64;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS sensor_current FLOAT64;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS health_anomaly_score FLOAT64;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS alarm_code INT64;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS warning_code INT64;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS fan_status BOOL;
ALTER TABLE `manufacturing.competition_telemetry`
    ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP;
