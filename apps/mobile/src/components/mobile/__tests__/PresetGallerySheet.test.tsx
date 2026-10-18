import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PresetGallerySheet from "../PresetGallerySheet";
import type { VisualEvidencePreset } from "../../../types";

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
  });

  afterEach(() => {
    cleanup();
  });

  it("hands the picked preset to onSelect", () => {
    render(
      <PresetGallerySheet open presets={mockPresets} loading={false} error={null} onClose={onClose} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByTestId("preset-select-btn-preset-im05-crack"));
    expect(onSelect).toHaveBeenCalledWith(mockPresets[1]);
  });

  it("shows the load error instead of an empty catalog", () => {
    render(
      <PresetGallerySheet open presets={[]} loading={false} error="Could not load the sample list (HTTP 500)" onClose={onClose} onSelect={onSelect} />
    );
    expect(screen.getByTestId("preset-fetch-error").textContent).toContain("HTTP 500");
    expect(screen.queryByText("No sample images in the catalog.")).toBeNull();
  });
});
