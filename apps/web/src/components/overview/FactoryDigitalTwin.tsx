import React from "react";
import type { IncidentState } from "../../types";
import { useFactoryStream } from "../../hooks/useFactoryStream";

interface FactoryDigitalTwinProps {
  incident: IncidentState | null;
}

export default function FactoryDigitalTwin({
  incident,
}: FactoryDigitalTwinProps): React.ReactElement {
  const { packet, connected, error } = useFactoryStream();

  const machines = packet.machines || packet.telemetry || [];
  const parts = packet.recent_parts || packet.parts || [];
  const anomaly = packet.active_anomaly;
  const edgeStats = packet.edge_stats;
  const suspectMachine = incident?.suspect_machine ?? null;

  return (
    <section
      className="glass card-pad"
      aria-label="Digital Twin & Factory Telemetry"
      style={{ marginBottom: "1.5rem" }}
      data-testid="factory-digital-twin"
    >
      <div className="row between wrap" style={{ gap: 12, marginBottom: "1rem" }}>
        <div>
          <div className="eyebrow">Realtime Physical Line &middot; Cell Line 1</div>
          <h2 className="card-title" style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 4px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "var(--accent)" }}>
              precision_manufacturing
            </span>
            Factory Floor Digital Twin
          </h2>
          <p className="card-sub" style={{ margin: 0 }}>
            Live sensor telemetry, edge vision optical conveyor stream, and physical asset status.
          </p>
        </div>

        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {connected ? (
            <span
              className="chip chip-green"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 650 }}
              data-testid="twin-status-live"
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "var(--green, #0e8a43)",
                  display: "inline-block",
                }}
              />
              Live Stream Connected
            </span>
          ) : (
            <span
              className="chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 650,
                background: "rgba(0,0,0,0.06)",
                color: "var(--muted)",
              }}
              data-testid="twin-status-offline"
              title={error ?? "Connecting to factory stream..."}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "var(--amber, #f59e0b)",
                  display: "inline-block",
                }}
              />
              Factory Offline &middot; Standby
            </span>
          )}
        </div>
      </div>

      {anomaly && (
        <div
          className="inset row between wrap"
          style={{
            gap: 12,
            alignItems: "center",
            background: "rgba(229, 72, 77, 0.12)",
            borderColor: "rgba(229, 72, 77, 0.4)",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: "1rem",
          }}
          data-testid="twin-active-anomaly"
        >
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <span className="material-symbols-outlined icon-fill" style={{ color: "#c9343a", fontSize: 24 }}>
              warning
            </span>
            <div>
              <div style={{ fontWeight: 700, color: "#c9343a", fontSize: "0.95rem" }}>
                Physical Anomaly Injected &middot; {anomaly.scenario ?? "Active Incident"}
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--ink)", marginTop: 2 }}>
                Target Machine: <strong>{anomaly.machine_id ?? "Line Asset"}</strong>
                {anomaly.tool_id ? ` &middot; Tool: ${anomaly.tool_id}` : ""} &middot; Severity:{" "}
                {(anomaly.severity * 100).toFixed(0)}% &middot; Elapsed: {anomaly.elapsed_seconds}s
              </div>
            </div>
          </div>
          <span className="chip chip-red mono" style={{ fontSize: "0.75rem" }}>
            INJECTION ACTIVE
          </span>
        </div>
      )}

      {/* Machine Telemetry Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: "1.2rem",
        }}
      >
        {machines.map((m) => {
          const isSuspect = suspectMachine === m.machine_id || anomaly?.machine_id === m.machine_id;
          return (
            <div
              key={m.machine_id}
              className={`glass-inset col ${isSuspect ? "tone-red" : ""}`}
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                border: isSuspect ? "1.5px solid rgba(229, 72, 77, 0.6)" : "1px solid var(--border)",
                background: isSuspect ? "rgba(229, 72, 77, 0.06)" : undefined,
                gap: 6,
              }}
              data-testid={`twin-machine-${m.machine_id}`}
            >
              <div className="row between" style={{ alignItems: "center" }}>
                <span className="mono" style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--ink)" }}>
                  {m.machine_id}
                </span>
                <span
                  className={`chip ${
                    m.operating_status === "NORMAL" ? "chip-green" : "chip-red"
                  }`}
                  style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                >
                  {m.operating_status}
                </span>
              </div>

              <div className="row between" style={{ fontSize: "0.8rem", color: "var(--text)" }}>
                <span>Vibration RMS:</span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {m.spindle_vibration.toFixed(2)} mm/s
                </span>
              </div>

              <div className="row between" style={{ fontSize: "0.8rem", color: "var(--text)" }}>
                <span>Motor Current:</span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {m.motor_current.toFixed(1)} A
                </span>
              </div>

              <div className="row between" style={{ fontSize: "0.8rem", color: "var(--text)" }}>
                <span>Spindle Temp:</span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {m.spindle_temp.toFixed(1)} &deg;C
                </span>
              </div>

              {m.dryer_dew_point !== undefined && m.dryer_dew_point !== null && (
                <div className="row between" style={{ fontSize: "0.8rem", color: "var(--text)" }}>
                  <span>Dryer Dew Pt:</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 600,
                      color: m.dryer_dew_point > -25 ? "#c9343a" : "var(--ink)",
                    }}
                  >
                    {m.dryer_dew_point.toFixed(0)} &deg;C
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Conveyor Belt & Edge Vision Inspection */}
      <div
        className="inset row wrap between"
        style={{
          gap: 16,
          alignItems: "center",
          padding: "12px 16px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.6)",
        }}
      >
        <div className="col" style={{ gap: 4, flex: 1, minWidth: 260 }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--accent)" }}>
              conveyor_belt
            </span>
            <span style={{ fontWeight: 650, fontSize: "0.88rem" }}>
              Conveyor Parts Stream ({parts.length})
            </span>
          </div>

          <div
            className="row wrap"
            style={{ gap: 6, maxHeight: 68, overflowY: "auto", marginTop: 4 }}
            data-testid="twin-conveyor-parts"
          >
            {parts.length === 0 ? (
              <span style={{ fontSize: "0.8rem", color: "var(--faint)" }}>
                Waiting for serialized part inspection stream...
              </span>
            ) : (
              parts.slice(-8).map((p) => {
                const isPass = p.status.toUpperCase() === "PASS";
                return (
                  <span
                    key={p.product_id}
                    className={`chip mono ${isPass ? "chip-green" : "chip-red"}`}
                    style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                    title={`${p.product_id} from ${p.machine_id}: ${p.status} (${(p.confidence * 100).toFixed(0)}%)`}
                  >
                    {p.product_id.split("-").slice(-1)[0]}: {p.status}
                  </span>
                );
              })
            )}
          </div>
        </div>

        {edgeStats && (
          <div
            className="col"
            style={{
              gap: 2,
              borderLeft: "1px solid var(--border)",
              paddingLeft: 16,
              minWidth: 200,
            }}
            data-testid="twin-edge-stats"
          >
            <div className="eyebrow" style={{ fontSize: "0.72rem" }}>
              Gemma 3 Edge Inspection Station
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--ink)", fontWeight: 600 }}>
              {edgeStats.cloud_bandwidth_reduction_pct.toFixed(0)}% cloud bandwidth filtered
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {edgeStats.pass_frames_dropped} pass dropped &middot; {edgeStats.defect_frames_forwarded} defect forwarded
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
