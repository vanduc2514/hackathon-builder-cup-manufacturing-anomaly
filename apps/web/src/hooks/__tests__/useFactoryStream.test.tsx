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
    };

    act(() => {
      es.simulateEvent("factory_tick", mockPacket);
    });

    expect(result.current.packet.tick_index).toBe(42);
    expect(result.current.packet.machines?.[0].machine_id).toBe("CNC-02");
    expect(result.current.packet.active_anomaly?.scenario).toBe("cnc_tool_wear");
  });

  it("handles disconnection gracefully without crashing", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFactoryStream({ reconnectIntervalMs: 1000 }));
    const es = MockEventSource.instances[0];

    act(() => {
      es.simulateOpen();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      es.simulateError();
    });
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toContain("disconnected");

    // Fast forward to reconnect
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances.length).toBe(2);

    vi.useRealTimers();
  });
});
