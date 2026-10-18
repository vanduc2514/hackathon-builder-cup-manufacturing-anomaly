import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import FactoryDigitalTwin from "../FactoryDigitalTwin";
import * as factoryHook from "../../../hooks/useFactoryStream";
import type { IncidentState, FactoryTickPacket } from "../../../types";

vi.mock("../../../hooks/useFactoryStream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../hooks/useFactoryStream")>();
  return {
    ...actual,
    useFactoryStream: vi.fn(),
  };
});

const mockIncident: IncidentState = {
  incident_id: "inc-test-01",
  status: "analyzing",
  status_reason: "Investigating anomaly",
  defect_type: "tool_wear",
  defect_rate: 0.08,
  spc_ucl: 0.03,
  suspect_machine: "CNC-02",
  suspect_tool: "T07",
  root_cause: null,
  verification_count: 0,
  verification_target: 30,
  approved: false,
  findings: [],
  impact: null,
  documents: {},
  updated_at: new Date().toISOString(),
};

const mockLivePacket: FactoryTickPacket = {
  tick_index: 100,
  machines: [
    {
      machine_id: "CNC-01",
      tool_id: "T01",
      spindle_vibration: 1.15,
      motor_current: 13.5,
      spindle_temp: 41.0,
      rpm: 8000,
      operating_status: "NORMAL",
    },
    {
      machine_id: "CNC-02",
      tool_id: "T07",
      spindle_vibration: 2.89,
      motor_current: 19.8,
      spindle_temp: 54.2,
      rpm: 8000,
      operating_status: "WARNING",
    },
  ],
  recent_parts: [
    {
      product_id: "PART-9999",
      machine_id: "CNC-02",
      status: "DEFECT",
      confidence: 0.94,
    },
  ],
  active_anomaly: {
    scenario: "cnc_tool_wear",
    machine_id: "CNC-02",
    tool_id: "T07",
    severity: 0.9,
    elapsed_seconds: 45,
  },
  edge_stats: {
    total_frames_evaluated: 500,
    pass_frames_dropped: 475,
    defect_frames_forwarded: 25,
    estimated_bandwidth_saved_mb: 18.5,
    cloud_bandwidth_reduction_pct: 95.0,
  },
};

describe("FactoryDigitalTwin Component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders empty state 'No data from Factory yet' before any tick arrives", () => {
    const emptyPacket: FactoryTickPacket = {
      tick_index: 0,
      machines: [],
      recent_parts: [],
      edge_stats: null,
      active_anomaly: null,
    };

    vi.spyOn(factoryHook, "useFactoryStream").mockReturnValue({
      packet: emptyPacket,
      connected: false,
      isStale: false,
      hasReceivedData: false,
      error: "Stream disconnected",
      lastTickAt: null,
      state: "closed",
      reconnectAttempt: 0,
      reconnect: vi.fn(),
    });

    render(<FactoryDigitalTwin incident={null} />);

    expect(screen.getByTestId("factory-digital-twin")).toBeDefined();
    expect(screen.getByTestId("twin-status-offline")).toBeDefined();
    expect(screen.getByTestId("twin-empty-state")).toBeDefined();
    expect(screen.getByText("No data from Factory yet")).toBeDefined();
    // Must NOT render fake machine cards or fake edge stats
    expect(screen.queryByTestId("twin-machine-CNC-01")).toBeNull();
    expect(screen.queryByTestId("twin-edge-stats")).toBeNull();
  });

  it("renders live connected state, machines, anomaly banner, and conveyor parts", () => {
    const now = Date.now();
    vi.spyOn(factoryHook, "useFactoryStream").mockReturnValue({
      packet: mockLivePacket,
      connected: true,
      isStale: false,
      hasReceivedData: true,
      error: null,
      lastTickAt: now,
      state: "open",
      reconnectAttempt: 0,
      reconnect: vi.fn(),
    });

    render(<FactoryDigitalTwin incident={mockIncident} />);

    expect(screen.getByTestId("twin-status-live")).toBeDefined();
    expect(screen.getByText(/Live Stream Connected/)).toBeDefined();
    expect(screen.queryByTestId("twin-empty-state")).toBeNull();
    expect(screen.getByTestId("twin-active-anomaly")).toBeDefined();
    expect(screen.getByText(/cnc_tool_wear/)).toBeDefined();
    expect(screen.getByTestId("twin-edge-stats")).toBeDefined();
    expect(screen.getByText(/95% cloud bandwidth filtered/)).toBeDefined();
    expect(screen.getByTitle(/PART-9999 from CNC-02/)).toBeDefined();
    expect(screen.getByText(/9999: DEFECT/)).toBeDefined();
    expect(screen.getByTestId("twin-machine-CNC-01")).toBeDefined();
    expect(screen.getByTestId("twin-machine-CNC-02")).toBeDefined();
  });

  it("renders stale state with lastTickAt and retains last packet when disconnected after receiving data", () => {
    const pastTimestamp = 1776333600000; // Fixed timestamp
    const expectedTimeStr = new Date(pastTimestamp).toLocaleTimeString();

    vi.spyOn(factoryHook, "useFactoryStream").mockReturnValue({
      packet: mockLivePacket,
      connected: false,
      isStale: true,
      hasReceivedData: true,
      error: "Stream disconnected — attempting auto-reconnect...",
      lastTickAt: pastTimestamp,
      state: "reconnecting",
      reconnectAttempt: 1,
      reconnect: vi.fn(),
    });

    render(<FactoryDigitalTwin incident={mockIncident} />);

    // Stale chip should be displayed with timestamp
    expect(screen.getByTestId("twin-status-stale")).toBeDefined();
    expect(screen.getByText(new RegExp(`Stale data \\(${expectedTimeStr}\\)`))).toBeDefined();
    expect(screen.getByTestId("twin-stale-banner")).toBeDefined();

    // Must NOT render empty state; should retain last packet machines and data
    expect(screen.queryByTestId("twin-empty-state")).toBeNull();
    expect(screen.getByTestId("twin-machine-CNC-01")).toBeDefined();
    expect(screen.getByTestId("twin-machine-CNC-02")).toBeDefined();
    expect(screen.getByTestId("twin-edge-stats")).toBeDefined();
  });
});
