import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import SpcRunChart from "../SpcRunChart";
import * as apiLib from "../../../lib/api";

// jsdom does not implement ResizeObserver; provide a no-op stub so useElementWidth
// can mount the component under test.
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = StubResizeObserver;
}

vi.mock("../../../lib/api", () => ({
  useApi: vi.fn(),
}));

const mockUseApi = vi.mocked(apiLib.useApi);

interface RenderedLabel {
  x: string;
  y: string;
  textAnchor: string;
  text: string;
}

function readLabel(container: HTMLElement): RenderedLabel | null {
  const text = container.querySelector("text");
  if (!text) return null;
  return {
    x: text.getAttribute("x") ?? "",
    y: text.getAttribute("y") ?? "",
    textAnchor: text.getAttribute("text-anchor") ?? "",
    text: text.textContent ?? "",
  };
}

const ucl = 0.05;
const W = 560; // matches useElementWidth fallback default in the component

// Build a 12-point run where one index carries the peak.
function makeSeries(peakIdx: number, peakRate: number) {
  const points = Array.from({ length: 12 }, (_, i) => ({
    defect_rate: i === peakIdx ? peakRate : 0.01,
    out_of_control: i === peakIdx,
  }));
  return {
    points,
    ucl,
    peak_rate: peakRate,
    source: "bigquery" as const,
  };
}

describe("SpcRunChart UCL excursion label anchoring", () => {
  beforeEach(() => {
    mockUseApi.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it("anchors left edge label to 'start' and pushes x inside the left pad (peakIdx=0)", () => {
    mockUseApi.mockReturnValue({ data: makeSeries(0, 0.12), loading: false, error: null } as never);
    const { container } = render(<SpcRunChart />);
    const label = readLabel(container);
    expect(label).not.toBeNull();
    expect(label!.textAnchor).toBe("start");
    // x must be inside the left padding (pad.l=8) — never pinned at x(0)=8 spilling outward.
    expect(parseFloat(label!.x)).toBeGreaterThanOrEqual(8);
    // text must include the formatted UCL percentage.
    expect(label!.text).toMatch(/UCL EXCURSION \(12\.00%\)/);
  });

  it("anchors middle label to 'middle' and keeps x roughly centered (peakIdx=mid)", () => {
    mockUseApi.mockReturnValue({ data: makeSeries(6, 0.12), loading: false, error: null } as never);
    const { container } = render(<SpcRunChart />);
    const label = readLabel(container);
    expect(label).not.toBeNull();
    expect(label!.textAnchor).toBe("middle");
    // x must sit between the chart left/right pads.
    const lx = parseFloat(label!.x);
    expect(lx).toBeGreaterThan(8);
    expect(lx).toBeLessThan(W - 8);
  });

  it("anchors right edge label to 'end' and clamps x inside the right pad (peakIdx=last)", () => {
    mockUseApi.mockReturnValue({ data: makeSeries(11, 0.12), loading: false, error: null } as never);
    const { container } = render(<SpcRunChart />);
    const label = readLabel(container);
    expect(label).not.toBeNull();
    expect(label!.textAnchor).toBe("end");
    // x(11) ~= W - pad.r; the clamp must keep it ≤ W-pad.r and not beyond.
    expect(parseFloat(label!.x)).toBeLessThanOrEqual(W - 8);
  });

  it("renders nothing when there are no out-of-control points", () => {
    mockUseApi.mockReturnValue({
      data: {
        points: [
          { defect_rate: 0.01, out_of_control: false },
          { defect_rate: 0.02, out_of_control: false },
        ],
        ucl,
        peak_rate: 0.02,
        source: "bigquery",
      },
      loading: false,
      error: null,
    } as never);
    const { container } = render(<SpcRunChart />);
    expect(readLabel(container)).toBeNull();
  });

  it("clamps the rendered x so the half-width label stays inside the chart bounds", () => {
    mockUseApi.mockReturnValue({ data: makeSeries(11, 0.12), loading: false, error: null } as never);
    const { container } = render(<SpcRunChart />);
    const label = readLabel(container);
    expect(label).not.toBeNull();
    const lx = parseFloat(label!.x);
    // With "end" anchor the label's right edge ≈ lx, so lx must not exceed W-pad.r.
    // Allow 1px rounding margin.
    expect(lx).toBeLessThanOrEqual(W - 8);
    // And it must not be negative (which would happen if the clamp math overshoots).
    expect(lx).toBeGreaterThanOrEqual(8);
  });
});
