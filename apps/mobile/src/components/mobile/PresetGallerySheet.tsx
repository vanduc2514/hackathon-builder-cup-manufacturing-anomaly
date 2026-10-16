import React, { useEffect, useState } from "react";
import { authFetch } from "../../api/auth";
import type { IncidentStatus, VisualEvidencePreset, VisualEvidencePresetListResponse } from "../../types";

export interface PresetGallerySheetProps {
  open: boolean;
  status: IncidentStatus | string;
  onClose: () => void;
  onSelectSuccess: (preset: VisualEvidencePreset) => void;
}

export default function PresetGallerySheet({
  open,
  status,
  onClose,
  onSelectSuccess,
}: PresetGallerySheetProps): React.ReactElement | null {
  const [presets, setPresets] = useState<VisualEvidencePreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const isAwaitingEvidence = status === "awaiting_evidence";

  useEffect(() => {
    if (!open) {
      setActionError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setFetchError(null);

    authFetch("/api/presets/evidence")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Không thể tải danh sách mẫu (HTTP ${res.status})`);
        }
        const data = (await res.json()) as VisualEvidencePresetListResponse;
        if (active) {
          setPresets(data.presets || []);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const msg = err instanceof Error ? err.message : "Lỗi kết nối khi tải danh sách mẫu";
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

  const handleSelectPreset = async (preset: VisualEvidencePreset) => {
    if (!isAwaitingEvidence) {
      setActionError("Chỉ có thể gửi ảnh mẫu khi hệ thống đang ở trạng thái chờ bằng chứng (awaiting_evidence).");
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
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });

      if (res.status === 409) {
        setActionError("Xung đột: AI hiện không ở trạng thái chờ bằng chứng hoặc đã phân tích xong (HTTP 409).");
        return;
      }

      if (res.status === 404) {
        setActionError("Không tìm thấy ảnh mẫu đã chọn trong hệ thống (HTTP 404).");
        return;
      }

      if (!res.ok) {
        setActionError(`Gửi ảnh mẫu thất bại (HTTP ${res.status}). Vui lòng thử lại.`);
        return;
      }

      onSelectSuccess(preset);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi mạng khi gửi ảnh mẫu";
      setActionError(`Lỗi kết nối: ${msg}`);
    } finally {
      setSubmittingId(null);
    }
  };

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
        aria-label="Chọn ảnh mẫu bằng chứng"
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
              Chọn ảnh mẫu (IM-05)
            </div>
          </div>
          <button
            type="button"
            className="m-iconbtn"
            onClick={onClose}
            aria-label="Đóng bảng chọn ảnh mẫu"
            style={{ minWidth: 44, minHeight: 44 }}
            data-testid="preset-gallery-close-btn"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="m-sub" style={{ fontSize: 12 }}>
          Bộ sưu tập 5 mẫu đối chuẩn phôi đúc ép IM-05 cho quy trình xác thực thị giác tự động.
        </div>

        <div style={{ margin: "4px 0" }}>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ghi chú kỹ thuật viên (tùy chọn)..."
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(15, 23, 42, 0.15)",
              fontSize: 12.5,
              background: "rgba(255, 255, 255, 0.9)",
              minHeight: 44,
              boxSizing: "border-box",
            }}
            data-testid="preset-notes-input"
          />
        </div>

        {!isAwaitingEvidence && (
          <div
            className="m-alert-box"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(255, 149, 0, 0.12)",
              color: "var(--ink)",
              border: "1px solid rgba(255, 149, 0, 0.4)",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            data-testid="preset-status-warning"
          >
            <span
              className="material-symbols-outlined"
              style={{ color: "var(--orange)", fontSize: 18 }}
            >
              warning
            </span>
            <span>
              Hệ thống hiện ở trạng thái <b>{status}</b>. Chỉ được gửi ảnh mẫu khi ở trạng thái{" "}
              <b>awaiting_evidence</b>.
            </span>
          </div>
        )}

        {actionError && (
          <div
            className="m-error-box"
            role="alert"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(255, 59, 48, 0.12)",
              color: "var(--red)",
              border: "1px solid rgba(255, 59, 48, 0.4)",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            data-testid="preset-action-error"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              error
            </span>
            <span>{actionError}</span>
          </div>
        )}

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
            Đang tải danh sách mẫu...
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
            Không có ảnh mẫu nào trong danh mục.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {presets.map((preset) => {
            const isSubmitting = submittingId === preset.id;
            return (
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
                      {preset.expected_defect_detected ? "Có khuyết tật" : "Đạt chuẩn"}
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
                    onClick={() => void handleSelectPreset(preset)}
                    disabled={!isAwaitingEvidence || isSubmitting || Boolean(submittingId)}
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
                    aria-label={`Chọn mẫu ${preset.title}`}
                    data-testid={`preset-select-btn-${preset.id}`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {isSubmitting ? "hourglass_empty" : "check"}
                    </span>
                    {isSubmitting ? "Đang gửi..." : "Chọn ảnh mẫu này"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
