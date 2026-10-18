import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { IncidentState, VisualEvidencePreset, VisualEvidencePresetListResponse } from "../../types";
import type { ToastTone } from "../../App";
import { authFetch } from "../../lib/auth";

export interface PresetEvidenceModalProps {
  open: boolean;
  incident: IncidentState;
  onClose: () => void;
  onNotify?: (text: string, tone?: ToastTone) => void;
  onSelectSuccess?: (preset: VisualEvidencePreset) => void;
}

export default function PresetEvidenceModal({
  open,
  incident,
  onClose,
  onNotify,
  onSelectSuccess,
}: PresetEvidenceModalProps): React.ReactElement | null {
  const [presets, setPresets] = useState<VisualEvidencePreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setFetchError(null);
    setActionError(null);

    authFetch("/api/presets/evidence")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Could not load the sample image catalog.`);
        }
        return res.json() as Promise<VisualEvidencePresetListResponse>;
      })
      .then((data) => {
        if (active) {
          setPresets(data.presets || []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setFetchError(err instanceof Error ? err.message : "Failed to load sample images");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  const isAwaitingEvidence = incident.status === "awaiting_evidence";

  const handleSelectPreset = async (preset: VisualEvidencePreset) => {
    if (!isAwaitingEvidence) {
      setActionError("Sample images can only be loaded while the incident is awaiting evidence (awaiting_evidence).");
      return;
    }

    setSubmittingId(preset.id);
    setActionError(null);

    try {
      const res = await authFetch("/api/incidents/evidence/preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset_id: preset.id,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        if (res.status === 409) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          const detailMsg = body.detail ? `: ${body.detail}` : "";
          throw new Error(
            `Conflict: the AI is not awaiting evidence or has already finished analysis (HTTP 409)${detailMsg}`
          );
        }
        if (res.status === 404) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          const detailMsg = body.detail ? `: ${body.detail}` : "";
          throw new Error(`Selected sample image not found (HTTP 404)${detailMsg}`);
        }
        throw new Error(`Server error (${res.status}) while loading the sample image.`);
      }

      onNotify?.(`Evidence sample image [${preset.title}] loaded successfully`, "success");
      onSelectSuccess?.(preset);
      onClose();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Unknown error while loading the sample image");
    } finally {
      setSubmittingId(null);
    }
  };

  const modalContent = (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        className="glass glass-strong modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Choose reference evidence sample image"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 720,
          width: "90%",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          overflowY: "auto",
        }}
      >
        <div className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">Visual Evidence Preset Gallery</div>
            <h3 className="card-title" style={{ fontSize: "1.3rem", margin: "2px 0 4px" }}>
              Choose a reference sample image for mold IM-05
            </h3>
            <p className="card-sub" style={{ margin: 0 }}>
              Real optical-inspection sample images for verifying physical defects and benchmarking root causes.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            aria-label="Close sample image picker"
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {!isAwaitingEvidence && (
          <div
            className="inset row"
            style={{
              gap: 10,
              alignItems: "center",
              background: "rgba(235, 94, 40, 0.12)",
              borderColor: "rgba(235, 94, 40, 0.4)",
              color: "var(--ink)",
              padding: "10px 14px",
              borderRadius: 8,
            }}
            data-testid="preset-status-warning"
          >
            <span className="material-symbols-outlined" style={{ color: "var(--accent)", fontSize: 22 }}>
              info
            </span>
            <div style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
              <strong>Note:</strong> The incident is currently in status{" "}
              <code>{incident.status}</code>. Loading a sample image is only available while the workflow is at the <code>awaiting_evidence</code> step.
            </div>
          </div>
        )}

        {actionError && (
          <div
            className="inset row"
            style={{
              gap: 10,
              alignItems: "center",
              background: "rgba(255, 59, 48, 0.12)",
              borderColor: "rgba(255, 59, 48, 0.4)",
              color: "#c9343a",
              padding: "10px 14px",
              borderRadius: 8,
            }}
            data-testid="preset-action-error"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
              error
            </span>
            <div style={{ fontSize: "0.85rem" }}>{actionError}</div>
          </div>
        )}

        <div className="col" style={{ gap: 6 }}>
          <label htmlFor="preset-notes-input" className="eyebrow" style={{ color: "var(--text)" }}>
            Attached notes (optional):
          </label>
          <input
            id="preset-notes-input"
            type="text"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="E.g. Checked the part from the 10:15 press cycle, found flash/cracked edge..."
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: "0.9rem",
            }}
            data-testid="preset-notes-input"
          />
        </div>

        {loading && (
          <div className="col center" style={{ padding: "40px 0", gap: 12, color: "var(--text)" }}>
            <span className="material-symbols-outlined spin" style={{ fontSize: 28 }}>
              sync
            </span>
            <span>Loading reference image catalog...</span>
          </div>
        )}

        {fetchError && (
          <div className="inset col center" style={{ padding: 24, gap: 10, color: "#c9343a" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
              warning
            </span>
            <span>{fetchError}</span>
          </div>
        )}

        {!loading && !fetchError && presets.length === 0 && (
          <div className="inset col center" style={{ padding: 24, color: "var(--text)" }}>
            No sample images available.
          </div>
        )}

        {!loading && !fetchError && presets.length > 0 && (
          <div className="col" style={{ gap: 12 }}>
            {presets.map((preset) => {
              const isSubmitting = submittingId === preset.id;
              return (
                <div
                  key={preset.id}
                  className="inset row wrap between"
                  style={{
                    gap: 16,
                    alignItems: "center",
                    padding: 12,
                    background: "rgba(255, 255, 255, 0.7)",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                  }}
                  data-testid={`preset-card-${preset.id}`}
                >
                  <img
                    src={preset.thumbnail_url}
                    alt={preset.title}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 8,
                      objectFit: "cover",
                      background: "#000",
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%23eee"/></svg>';
                    }}
                  />
                  <div className="col" style={{ flex: 1, minWidth: 220, gap: 4 }}>
                    <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
                      <span style={{ fontWeight: 650, fontSize: "0.95rem", color: "var(--ink)" }}>
                        {preset.title}
                      </span>
                      <span
                        className={`chip ${
                          preset.expected_defect_detected ? "chip-red" : "chip-green"
                        }`}
                        style={{ fontSize: "0.75rem" }}
                      >
                        {preset.expected_defect_detected ? "Defect" : "Pass"}
                      </span>
                      {preset.suggested_sop_code && (
                        <span className="chip mono" style={{ fontSize: "0.72rem" }}>
                          SOP-{preset.suggested_sop_code}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.35 }}>
                      {preset.description}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--faint)", fontStyle: "italic" }}>
                      AI analysis: {preset.analysis}
                    </div>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn btn-dark"
                      onClick={() => void handleSelectPreset(preset)}
                      disabled={!isAwaitingEvidence || isSubmitting || Boolean(submittingId)}
                      style={{ minWidth: 150, gap: 6, fontWeight: 600 }}
                      data-testid={`preset-select-btn-${preset.id}`}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                        {isSubmitting ? "sync" : "upload_file"}
                      </span>
                      <span>{isSubmitting ? "Loading…" : "Load this image"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}
