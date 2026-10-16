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

describe("FactoryDigitalTwin Component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders offline standby state gracefully when disconnected", () => {
    const offlinePacket: FactoryTickPacket = {
      tick_index: 0,
      machines: [
        {
          machine_id: "CNC-01",
          tool_id: "T01",
          spindle_vibration: 1.18,
          motor_current: 13.8,
          spindle_temp: 41.5,
          rpm: 8000,
          operating_status: "NORMAL",
        },
      ],
      recent_parts: [],
      edge_stats: {
        total_frames_evaluated: 0,
        pass_frames_dropped: 0,
        defect_frames_forwarded: 0,
        estimated_bandwidth_saved_mb: 0,
        cloud_bandwidth_reduction_pct: 95.0,
      },
      active_anomaly: null,
    };

    vi.spyOn(factoryHook, "useFactoryStream").mockReturnValue({
      packet: offlinePacket,
      connected: false,
      error: "Stream disconnected",
      lastTickAt: null,
      reconnect: vi.fn(),
    });

    render(<FactoryDigitalTwin incident={null} />);

    expect(screen.getByTestId("factory-digital-twin")).toBeDefined();
    expect(screen.getByTestId("twin-status-offline")).toBeDefined();
    expect(screen.getByText(/Factory Offline/)).toBeDefined();
    expect(screen.getByTestId("twin-machine-CNC-01")).toBeDefined();
  });

  it("renders live connected state, machines, anomaly banner, and conveyor parts", () => {
    vi.spyOn(factoryHook, "useFactoryStream").mockReturnValue({
      packet: {
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
      },
      connected: true,
      error: null,
      lastTickAt: Date.now(),
      reconnect: vi.fn(),
    });

    render(<FactoryDigitalTwin incident={mockIncident} />);

    expect(screen.getByTestId("twin-status-live")).toBeDefined();
    expect(screen.getByText(/Live Stream Connected/)).toBeDefined();
    expect(screen.getByTestId("twin-active-anomaly")).toBeDefined();
    expect(screen.getByText(/cnc_tool_wear/)).toBeDefined();
    expect(screen.getByTestId("twin-edge-stats")).toBeDefined();
    expect(screen.getByText(/95% cloud bandwidth filtered/)).toBeDefined();
    expect(screen.getByTitle(/PART-9999 from CNC-02/)).toBeDefined();
    expect(screen.getByText(/9999: DEFECT/)).toBeDefined();
  });
});
