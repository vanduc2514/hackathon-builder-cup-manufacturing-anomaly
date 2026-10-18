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
  const onSelect = vi.fn();

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
    const { container } = render(<PresetGallerySheet open={false} onClose={onClose} onSelect={onSelect} />);
    expect(container.firstChild).toBeNull();
  });

  it("fetches and renders presets with thumbnails and metadata", async () => {
    render(<PresetGallerySheet open={true} onClose={onClose} onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText("IM-05 Molded Tray Nominal Baseline")).toBeDefined();
      expect(screen.getByText("IM-05 Housing Structural Wall Crack")).toBeDefined();
    });

    const img = screen.getByAltText("IM-05 Housing Structural Wall Crack") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/presets/evidence/preset_im05_crack.jpg");
    expect(screen.getByText("Pass")).toBeDefined();
    expect(screen.getByText("Defect")).toBeDefined();
  });

  it("hands the picked preset to onSelect without sending anything", async () => {
    render(<PresetGallerySheet open={true} onClose={onClose} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByTestId("preset-select-btn-preset-im05-crack")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("preset-select-btn-preset-im05-crack"));

    expect(onSelect).toHaveBeenCalledWith(mockPresets[1]);
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/presets/evidence");
  });

  it("shows the load error when the sample list cannot be fetched", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    render(<PresetGallerySheet open={true} onClose={onClose} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByTestId("preset-fetch-error").textContent).toContain("HTTP 500");
    });
  });
});
