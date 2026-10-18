import React, { useEffect, useState } from "react";
import { authFetch } from "../../api/auth";
import type { VisualEvidencePreset, VisualEvidencePresetListResponse } from "../../types";

export interface PresetGallerySheetProps {
  open: boolean;
  onClose: () => void;
  /** The picked sample goes through the same review and submit flow as a camera shot. */
  onSelect: (preset: VisualEvidencePreset) => void;
}

export default function PresetGallerySheet({
  open,
  onClose,
  onSelect,
}: PresetGallerySheetProps): React.ReactElement | null {
  const [presets, setPresets] = useState<VisualEvidencePreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoading(true);
    setFetchError(null);

    authFetch("/api/presets/evidence")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Could not load the sample list (HTTP ${res.status})`);
        }
        const data = (await res.json()) as VisualEvidencePresetListResponse;
        if (active) {
          setPresets(data.presets || []);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const msg = err instanceof Error ? err.message : "Connection error while loading the sample list";
          setFetchError(msg);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="m-sheet-backdrop"
        style={{ zIndex: 75 }}
        onClick={onClose}
        data-testid="preset-gallery-backdrop"
      />
      <div
        className="m-sheet"
        role="dialog"
        aria-label="Choose evidence sample image"
        style={{
          zIndex: 76,
          bottom: 24,
          maxHeight: "85vh",
          overflowY: "auto",
          paddingBottom: 24,
        }}
        data-testid="preset-gallery-sheet"
      >
        <div className="m-sheet-grabber" />

        <div className="m-between" style={{ alignItems: "center", marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="material-symbols-outlined ms-fill"
              style={{ color: "var(--accent)", fontSize: 24 }}
            >
              photo_library
            </span>
            <div className="m-h3" style={{ fontSize: 16 }}>
              Choose sample image (IM-05)
            </div>
          </div>
          <button
            type="button"
            className="m-iconbtn"
            onClick={onClose}
            aria-label="Close sample image picker"
            style={{ minWidth: 44, minHeight: 44 }}
            data-testid="preset-gallery-close-btn"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="m-sub" style={{ fontSize: 12 }}>
          Collection of 5 IM-05 injection-molded reference samples for automated visual verification.
        </div>

        {loading && (
          <div
            style={{
              padding: "24px 0",
              textAlign: "center",
              color: "var(--ink-3)",
              fontSize: 13,
            }}
            data-testid="preset-loading"
          >
            Loading sample list...
          </div>
        )}

        {fetchError && (
          <div
            role="alert"
            style={{
              padding: "12px",
              borderRadius: 12,
              background: "rgba(255, 59, 48, 0.1)",
              color: "var(--red)",
              fontSize: 12,
            }}
            data-testid="preset-fetch-error"
          >
            {fetchError}
          </div>
        )}

        {!loading && !fetchError && presets.length === 0 && (
          <div
            style={{
              padding: "20px 0",
              textAlign: "center",
              color: "var(--ink-3)",
              fontSize: 13,
            }}
          >
            No sample images in the catalog.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {presets.map((preset) => (
              <div
                key={preset.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: 10,
                  borderRadius: 16,
                  background: "rgba(255, 255, 255, 0.8)",
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                  alignItems: "center",
                }}
                data-testid={`preset-card-${preset.id}`}
              >
                <img
                  src={preset.thumbnail_url}
                  alt={preset.title}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 10,
                    objectFit: "cover",
                    background: "#000",
                    flexShrink: 0,
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"72\" height=\"72\"%3E%3Crect width=\"72\" height=\"72\" fill=\"%23ddd\"/%3E%3C/svg%3E";
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: "var(--ink)",
                      }}
                    >
                      {preset.title}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 6,
                        fontWeight: 500,
                        background: preset.expected_defect_detected
                          ? "rgba(255, 59, 48, 0.12)"
                          : "rgba(48, 194, 90, 0.12)",
                        color: preset.expected_defect_detected
                          ? "var(--red)"
                          : "var(--green)",
                      }}
                    >
                      {preset.expected_defect_detected ? "Defect" : "Pass"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--ink-2)",
                      lineHeight: 1.35,
                      marginBottom: 8,
                    }}
                  >
                    {preset.description}
                  </div>
                  <button
                    type="button"
                    className="m-btn accent"
                    onClick={() => onSelect(preset)}
                    style={{
                      minHeight: 44,
                      minWidth: 44,
                      padding: "0 14px",
                      fontSize: 12.5,
                      fontWeight: 600,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                    aria-label={`Choose sample ${preset.title}`}
                    data-testid={`preset-select-btn-${preset.id}`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      check
                    </span>
                    Use this image
                  </button>
                </div>
              </div>
          ))}
        </div>
      </div>
    </>
  );
}
