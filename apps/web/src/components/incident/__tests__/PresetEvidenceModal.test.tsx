import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import PresetEvidenceModal from "../PresetEvidenceModal";
import { authFetch } from "../../../lib/auth";
import type { IncidentState, VisualEvidencePreset } from "../../../types";

vi.mock("../../../lib/auth", () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = vi.mocked(authFetch);

const mockIncidentAwaiting: IncidentState = {
  incident_id: "inc-101",
  status: "awaiting_evidence",
  status_reason: "Awaiting field evidence",
  defect_type: "structural_crack",
  defect_rate: 0.12,
  spc_ucl: 0.05,
  suspect_machine: "IM-05",
  suspect_tool: "MOLD-03",
  root_cause: null,
  verification_count: 0,
  verification_target: 30,
  approved: false,
  findings: [],
  impact: null,
  documents: {},
  updated_at: new Date().toISOString(),
};

const mockIncidentNormal: IncidentState = {
  ...mockIncidentAwaiting,
  status: "normal",
};

const mockPresets: VisualEvidencePreset[] = [
  {
    id: "preset-im05-normal",
    title: "IM-05 Molded Tray Nominal Baseline",
    category: "normal",
    machine_id: "IM-05",
    tool_id: "MOLD-03",
    description: "Intact molded plastic tray nominal CAD specifications.",
    analysis: "Visual metrology confirms intact part geometry.",
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

describe("PresetEvidenceModal", () => {
  const onClose = vi.fn();
  const onNotify = vi.fn();
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
    render(
      <PresetEvidenceModal
        open={false}
        incident={mockIncidentAwaiting}
        onClose={onClose}
        onNotify={onNotify}
        onSelectSuccess={onSelectSuccess}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders presets and metadata when open is true", async () => {
    render(
      <PresetEvidenceModal
        open={true}
        incident={mockIncidentAwaiting}
        onClose={onClose}
        onNotify={onNotify}
        onSelectSuccess={onSelectSuccess}
      />
    );

    expect(screen.getByRole("dialog")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText("IM-05 Molded Tray Nominal Baseline")).toBeDefined();
      expect(screen.getByText("IM-05 Housing Structural Wall Crack")).toBeDefined();
      expect(screen.getByText("SOP-209")).toBeDefined();
    });

    const img = screen.getByAltText("IM-05 Housing Structural Wall Crack") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/presets/evidence/preset_im05_crack.jpg");
  });

  it("submits preset to /api/incidents/evidence/preset with notes and triggers callbacks", async () => {
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
      <PresetEvidenceModal
        open={true}
        incident={mockIncidentAwaiting}
        onClose={onClose}
        onNotify={onNotify}
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preset_id: "preset-im05-crack",
            notes: "Ảnh chụp khuôn 3 nứt vỏ",
          }),
        })
      );
      expect(onNotify).toHaveBeenCalledWith(
        expect.stringContaining("IM-05 Housing Structural Wall Crack"),
        "success"
      );
      expect(onSelectSuccess).toHaveBeenCalledWith(mockPresets[1]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("disables select buttons and shows warning when incident status is not awaiting_evidence", async () => {
    render(
      <PresetEvidenceModal
        open={true}
        incident={mockIncidentNormal}
        onClose={onClose}
        onNotify={onNotify}
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

  it("handles HTTP 409 conflict gracefully with friendly message", async () => {
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
          json: async () => ({ detail: "AI is not waiting for evidence right now" }),
        } as unknown as Response;
      }
      return { ok: false, status: 500 } as unknown as Response;
    });

    render(
      <PresetEvidenceModal
        open={true}
        incident={mockIncidentAwaiting}
        onClose={onClose}
        onNotify={onNotify}
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
      <PresetEvidenceModal
        open={true}
        incident={mockIncidentAwaiting}
        onClose={onClose}
        onNotify={onNotify}
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

  it("closes modal on Escape key press", () => {
    render(
      <PresetEvidenceModal
        open={true}
        incident={mockIncidentAwaiting}
        onClose={onClose}
        onNotify={onNotify}
        onSelectSuccess={onSelectSuccess}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
