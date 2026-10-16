import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFactoryStream } from "../useFactoryStream";
import type { FactoryTickPacket } from "../../types";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((ev: MessageEvent) => void)[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, callback: (ev: MessageEvent) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  removeEventListener(event: string, callback: (ev: MessageEvent) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    }
  }

  close() {
    this.closed = true;
  }

  simulateOpen() {
    if (this.onopen) this.onopen();
  }

  simulateEvent(eventType: string, data: unknown) {
    const ev = new MessageEvent(eventType, {
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
    if (eventType === "message" && this.onmessage) {
      this.onmessage(ev);
    }
    const handlers = this.listeners[eventType] || [];
    handlers.forEach((h) => h(ev));
  }

  simulateError() {
    if (this.onerror) this.onerror();
  }
}

describe("useFactoryStream hook", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    vi.restoreAllMocks();
  });

  it("starts empty without fabricated machines or edge stats", () => {
    const { result } = renderHook(() => useFactoryStream({ enabled: false }));

    expect(result.current.packet.machines).toEqual([]);
    expect(result.current.packet.edge_stats).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.isStale).toBe(false);
    expect(result.current.hasReceivedData).toBe(false);
    expect(result.current.lastTickAt).toBeNull();
  });

  it("connects to /api/factory/stream and manages connection lifecycle", () => {
    const { result, unmount } = renderHook(() => useFactoryStream());

    expect(MockEventSource.instances.length).toBe(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain("/api/factory/stream");
    expect(result.current.connected).toBe(false);

    act(() => {
      es.simulateOpen();
    });
    expect(result.current.connected).toBe(true);
    expect(result.current.error).toBeNull();

    unmount();
    expect(es.closed).toBe(true);
  });

  it("updates packet on factory_tick SSE event", () => {
    const { result } = renderHook(() => useFactoryStream());
    const es = MockEventSource.instances[0];

    act(() => {
      es.simulateOpen();
    });

    const mockPacket: FactoryTickPacket = {
      tick_index: 42,
      machines: [
        {
          machine_id: "CNC-02",
          tool_id: "T07",
          spindle_vibration: 2.85,
          motor_current: 19.5,
          spindle_temp: 52.0,
          rpm: 8000,
          operating_status: "WARNING",
        },
      ],
      recent_parts: [
        {
          product_id: "PART-4200",
          machine_id: "CNC-02",
          status: "PASS",
          confidence: 0.99,
        },
      ],
      active_anomaly: {
        scenario: "cnc_tool_wear",
        machine_id: "CNC-02",
        tool_id: "T07",
        severity: 0.8,
        elapsed_seconds: 14,
      },
      edge_stats: {
        total_frames_evaluated: 200,
        pass_frames_dropped: 190,
        defect_frames_forwarded: 10,
        estimated_bandwidth_saved_mb: 7.2,
        cloud_bandwidth_reduction_pct: 95.0,
      },
    };

    act(() => {
      es.simulateEvent("factory_tick", mockPacket);
    });

    expect(result.current.hasReceivedData).toBe(true);
    expect(result.current.isStale).toBe(false);
    expect(result.current.lastTickAt).not.toBeNull();
    expect(result.current.packet.tick_index).toBe(42);
    expect(result.current.packet.machines?.[0].machine_id).toBe("CNC-02");
    expect(result.current.packet.active_anomaly?.scenario).toBe("cnc_tool_wear");
  });

  it("handles disconnection gracefully and transitions to stale if data was previously received", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFactoryStream({ reconnectIntervalMs: 1000 }));
    const es = MockEventSource.instances[0];

    act(() => {
      es.simulateOpen();
    });
    expect(result.current.connected).toBe(true);

    // Send a tick so data has been received
    const mockPacket: FactoryTickPacket = {
      tick_index: 10,
      machines: [
        {
          machine_id: "CNC-01",
          tool_id: "T01",
          spindle_vibration: 1.1,
          motor_current: 13.0,
          spindle_temp: 40.0,
          rpm: 8000,
          operating_status: "NORMAL",
        },
      ],
      recent_parts: [],
      edge_stats: null,
      active_anomaly: null,
    };
    act(() => {
      es.simulateEvent("factory_tick", mockPacket);
    });
    expect(result.current.hasReceivedData).toBe(true);
    expect(result.current.isStale).toBe(false);

    // Disconnect
    act(() => {
      es.simulateError();
    });
    expect(result.current.connected).toBe(false);
    expect(result.current.isStale).toBe(true);
    expect(result.current.error).toContain("disconnected");
    // Packet is preserved
    expect(result.current.packet.tick_index).toBe(10);
    expect(result.current.packet.machines?.length).toBe(1);

    // Fast forward to reconnect
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances.length).toBe(2);

    vi.useRealTimers();
  });

  it("detects silent stream death via watchdog timer without onerror and auto-reconnects", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useFactoryStream({ reconnectIntervalMs: 1000, watchdogTimeoutMs: 2000 })
    );
    expect(MockEventSource.instances.length).toBe(1);
    const es1 = MockEventSource.instances[0];

    act(() => {
      es1.simulateOpen();
    });
    expect(result.current.connected).toBe(true);

    const mockPacket: FactoryTickPacket = {
      tick_index: 5,
      machines: [
        {
          machine_id: "CNC-01",
          tool_id: "T01",
          spindle_vibration: 1.0,
          motor_current: 12.0,
          spindle_temp: 38.0,
          rpm: 8000,
          operating_status: "NORMAL",
        },
      ],
      recent_parts: [],
      edge_stats: null,
      active_anomaly: null,
    };
    act(() => {
      es1.simulateEvent("factory_tick", mockPacket);
    });
    expect(result.current.hasReceivedData).toBe(true);
    expect(result.current.connected).toBe(true);
    expect(result.current.isStale).toBe(false);

    // Simulate silent death: no onerror is fired, time passes beyond watchdogTimeoutMs (2000ms)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Hook must detect timeout, close old EventSource, mark connected=false, isStale=true
    expect(es1.closed).toBe(true);
    expect(result.current.connected).toBe(false);
    expect(result.current.isStale).toBe(true);
    expect(result.current.error).toContain("timed out");

    // Advance time by reconnectIntervalMs (1000ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // A new EventSource connection attempt must be made
    expect(MockEventSource.instances.length).toBe(2);
    const es2 = MockEventSource.instances[1];
    expect(es2.closed).toBe(false);

    // When the stream recovers, it connects and clears stale state
    act(() => {
      es2.simulateOpen();
      es2.simulateEvent("factory_tick", { ...mockPacket, tick_index: 6 });
    });
    expect(result.current.connected).toBe(true);
    expect(result.current.isStale).toBe(false);
    expect(result.current.packet.tick_index).toBe(6);

    vi.useRealTimers();
  });
});

