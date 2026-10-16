import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import PresetGallerySheet from "../PresetGallerySheet";
import { authFetch } from "../../../api/auth";
import type { VisualEvidencePreset } from "../../../types";

vi.mock("../../../api/auth", () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = vi.mocked(authFetch);

const mockPresets: VisualEvidencePreset[] = [
  {
    id: "preset-im05-normal",
    title: "IM-05 Molded Tray Nominal Baseline",
    category: "normal",
    machine_id: "IM-05",
    tool_id: "MOLD-03",
    description: "Intact molded plastic tray nominal CAD specifications.",
    analysis: "Visual metrology confirms intact part.",
    thumbnail_url: "/presets/evidence/preset_im05_normal.jpg",
    image_url: "/presets/evidence/preset_im05_normal.jpg",
    expected_defect_detected: false,
    expected_wear_mm: null,
    suggested_sop_code: null,
  },
  {
    id: "preset-im05-crack",
    title: "IM-05 Housing Structural Wall Crack",
    category: "crack",
    machine_id: "IM-05",
    tool_id: "MOLD-03",
    description: "Visible longitudinal surface crack.",
    analysis: "Visual metrology detects structural crack.",
    thumbnail_url: "/presets/evidence/preset_im05_crack.jpg",
    image_url: "/presets/evidence/preset_im05_crack.jpg",
    expected_defect_detected: true,
    expected_wear_mm: null,
    suggested_sop_code: 209,
  },
];

describe("PresetGallerySheet", () => {
  const onClose = vi.fn();
  const onSelectSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFetch.mockImplementation(async (url: string) => {
      if (url === "/api/presets/evidence") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ presets: mockPresets }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ status: "success" }) } as unknown as Response;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render when open is false", () => {
    const { container } = render(
      <PresetGallerySheet
        open={false}
        status="awaiting_evidence"
        onClose={onClose}
        onSelectSuccess={onSelectSuccess}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("fetches and renders presets with thumbnails and metadata", async () => {
    render(
      <PresetGallerySheet
        open={true}
        status="awaiting_evidence"
        onClose={onClose}
        onSelectSuccess={onSelectSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("IM-05 Molded Tray Nominal Baseline")).toBeDefined();
      expect(screen.getByText("IM-05 Housing Structural Wall Crack")).toBeDefined();
    });

    const img = screen.getByAltText("IM-05 Housing Structural Wall Crack") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/presets/evidence/preset_im05_crack.jpg");
    expect(screen.getByText("Đạt chuẩn")).toBeDefined();
    expect(screen.getByText("Có khuyết tật")).toBeDefined();
  });

  it("submits selected preset to /api/incidents/evidence/preset with notes and triggers onSelectSuccess", async () => {
    mockAuthFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/presets/evidence") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ presets: mockPresets }),
        } as unknown as Response;
      }
      if (url === "/api/incidents/evidence/preset" && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            incident_status: "analyzing",
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 400 } as unknown as Response;
    });

    render(
      <PresetGallerySheet
        open={true}
        status="awaiting_evidence"
        onClose={onClose}
        onSelectSuccess={onSelectSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("preset-select-btn-preset-im05-crack")).toBeDefined();
    });

    const notesInput = screen.getByTestId("preset-notes-input");
    fireEvent.change(notesInput, { target: { value: "Ảnh chụp khuôn 3 nứt vỏ" } });

    const selectBtn = screen.getByTestId("preset-select-btn-preset-im05-crack");
    fireEvent.click(selectBtn);

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        "/api/incidents/evidence/preset",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            preset_id: "preset-im05-crack",
            notes: "Ảnh chụp khuôn 3 nứt vỏ",
          }),
        })
      );
      expect(onSelectSuccess).toHaveBeenCalledWith(mockPresets[1]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("disables selection and displays warning when status is not awaiting_evidence", async () => {
    render(
      <PresetGallerySheet
        open={true}
        status="normal"
        onClose={onClose}
        onSelectSuccess={onSelectSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("preset-status-warning")).toBeDefined();
    });

    const selectBtn = screen.getByTestId("preset-select-btn-preset-im05-crack") as HTMLButtonElement;
    expect(selectBtn.disabled).toBe(true);

    fireEvent.click(selectBtn);
    expect(mockAuthFetch).not.toHaveBeenCalledWith(
      "/api/incidents/evidence/preset",
      expect.anything()
    );
  });

  it("handles HTTP 409 conflict gracefully with user-friendly message", async () => {
    mockAuthFetch.mockImplementation(async (url: string) => {
      if (url === "/api/presets/evidence") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ presets: mockPresets }),
        } as unknown as Response;
      }
      if (url === "/api/incidents/evidence/preset") {
        return {
          ok: false,
          status: 409,
          json: async () => ({ detail: "The AI is not waiting for evidence right now" }),
        } as unknown as Response;
      }
      return { ok: false, status: 500 } as unknown as Response;
    });

    render(
      <PresetGallerySheet
        open={true}
        status="awaiting_evidence"
        onClose={onClose}
        onSelectSuccess={onSelectSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("preset-select-btn-preset-im05-crack")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("preset-select-btn-preset-im05-crack"));

    await waitFor(() => {
      expect(screen.getByTestId("preset-action-error")).toBeDefined();
      expect(screen.getByText(/409/)).toBeDefined();
    });
    expect(onSelectSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handles HTTP 404 not found error gracefully", async () => {
    mockAuthFetch.mockImplementation(async (url: string) => {
      if (url === "/api/presets/evidence") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ presets: mockPresets }),
        } as unknown as Response;
      }
      if (url === "/api/incidents/evidence/preset") {
        return {
          ok: false,
          status: 404,
          json: async () => ({ detail: "Preset not found" }),
        } as unknown as Response;
      }
      return { ok: false, status: 500 } as unknown as Response;
    });

    render(
      <PresetGallerySheet
        open={true}
        status="awaiting_evidence"
        onClose={onClose}
        onSelectSuccess={onSelectSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("preset-select-btn-preset-im05-crack")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("preset-select-btn-preset-im05-crack"));

    await waitFor(() => {
      expect(screen.getByTestId("preset-action-error")).toBeDefined();
      expect(screen.getByText(/404/)).toBeDefined();
    });
    expect(onSelectSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("in demo mode (isLive=false), selecting preset triggers onSelectSuccess without calling POST API", async () => {
    render(
      <PresetGallerySheet
        open={true}
        isLive={false}
        status="normal"
        onClose={onClose}
        onSelectSuccess={onSelectSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("preset-select-btn-preset-im05-crack")).toBeDefined();
    });

    // Warning should NOT be present in demo mode
    expect(screen.queryByTestId("preset-status-warning")).toBeNull();

    fireEvent.click(screen.getByTestId("preset-select-btn-preset-im05-crack"));

    // Verify authFetch POST was never called
    expect(mockAuthFetch).not.toHaveBeenCalledWith(
      "/api/incidents/evidence/preset",
      expect.anything()
    );
    expect(onSelectSuccess).toHaveBeenCalledWith(mockPresets[1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("in live mode, when canSubmitEvidence is false, selection is disabled even if status is awaiting_evidence", async () => {
    render(
      <PresetGallerySheet
        open={true}
        isLive={true}
        canSubmitEvidence={false}
        status="awaiting_evidence"
        onClose={onClose}
        onSelectSuccess={onSelectSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("preset-status-warning")).toBeDefined();
    });

    const selectBtn = screen.getByTestId("preset-select-btn-preset-im05-crack") as HTMLButtonElement;
    expect(selectBtn.disabled).toBe(true);
  });
});
