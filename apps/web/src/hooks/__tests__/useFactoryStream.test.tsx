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

describe("useFactoryStream auth token (TKT-073/#288)", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    localStorage.removeItem("kaizen.auth");
    vi.restoreAllMocks();
  });

  it("appends the login token to the stream URL when a session exists", async () => {
    localStorage.setItem(
      "kaizen.auth",
      JSON.stringify({
        token: "test-jwt-token",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        user: { username: "shift_leader", display_name: "Shift Leader", role: "shift_leader" },
      }),
    );
    // Dynamic import is intentional (module-loading test): the auth module
    // reads localStorage once at import time, so a static import could never
    // see the session seeded above.
    vi.resetModules();
    const { useFactoryStream: authedUseFactoryStream } = await import("../useFactoryStream");

    const { unmount } = renderHook(() => authedUseFactoryStream());

    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toContain(
      "/api/factory/stream?token=test-jwt-token",
    );
    unmount();
  });

  it("omits the token when no session exists", async () => {
    // Dynamic import is intentional (module-loading test): force a fresh auth
    // module instance so it observes the empty localStorage state.
    vi.resetModules();
    const { useFactoryStream: anonUseFactoryStream } = await import("../useFactoryStream");

    const { unmount } = renderHook(() => anonUseFactoryStream());

    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toContain("/api/factory/stream");
    expect(MockEventSource.instances[0].url).not.toContain("token=");
    unmount();
  });
});

describe("useFactoryStream jittered backoff (#265)", () => {
  const originalEventSource = globalThis.EventSource;
  const originalRandom = Math.random;

  beforeEach(() => {
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    Math.random = originalRandom;
    vi.restoreAllMocks();
  });

  it("closes the EventSource on every reconnect attempt and uses ladder delays (Mocked Math.random=1)", () => {
    // Fix Math.random to the upper bound so each attempt waits the full
    // ladder delay (1s, 2s, 5s, 5s, 5s — capped). The test then verifies the
    // cumulative advance against the brief's ±20 % tolerance band.
    Math.random = (() => 1.0) as unknown as typeof Math.random;
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useFactoryStream());
      // Initial connect.
      expect(MockEventSource.instances.length).toBe(1);
      const es1 = MockEventSource.instances[0];
      act(() => es1.simulateError());
      expect(es1.closed).toBe(true);
      // Ladder[0] = 1 s, with Math.random=1 the timer fires at 1 s.
      act(() => vi.advanceTimersByTime(1000));
      expect(MockEventSource.instances.length).toBe(2);
      const es2 = MockEventSource.instances[1];
      act(() => es2.simulateError());
      expect(es2.closed).toBe(true);
      // Ladder[1] = 2 s, so a 1 s advance is short by 1 s.
      act(() => vi.advanceTimersByTime(1000));
      expect(MockEventSource.instances.length).toBe(2);
      act(() => vi.advanceTimersByTime(1000));
      expect(MockEventSource.instances.length).toBe(3);
      const es3 = MockEventSource.instances[2];
      act(() => es3.simulateError());
      expect(es3.closed).toBe(true);
      // Ladder[2] = 5 s; 2 s advance is still short.
      act(() => vi.advanceTimersByTime(2000));
      expect(MockEventSource.instances.length).toBe(3);
      act(() => vi.advanceTimersByTime(3000));
      expect(MockEventSource.instances.length).toBe(4);
      const es4 = MockEventSource.instances[3];
      act(() => es4.simulateError());
      expect(es4.closed).toBe(true);
      // Ladder[3] = 5 s; advance once to fire the next attempt.
      act(() => vi.advanceTimersByTime(5000));
      expect(MockEventSource.instances.length).toBe(5);
      const es5 = MockEventSource.instances[4];
      act(() => es5.simulateError());
      expect(es5.closed).toBe(true);
      // Ladder[4] = 5 s; advance once more so the 5th reconnect would have
      // happened. After the next error the state should transition to
      // `closed` because we are about to schedule the 6th attempt.
      act(() => vi.advanceTimersByTime(5000));
      expect(MockEventSource.instances.length).toBe(6);
      const es6 = MockEventSource.instances[5];
      act(() => es6.simulateError());
      expect(es6.closed).toBe(true);
      // scheduleReconnect sees attempt=5 ≥ MAX_RECONNECT_ATTEMPTS=5 -> closed.
      expect(result.current.state).toBe("closed");
      expect(result.current.error).toMatch(/5 reconnect attempts/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("computeBackoffDelayMs returns uniform(0, base) and caps at the last ladder entry", async () => {
    const mod = await import("../useFactoryStream");
    // Sequence chosen so floor() doesn't fight the tolerance.
    const cases: Array<{ random: number; attempt: number; wantMs: number }> = [
      { random: 0.0, attempt: 0, wantMs: 0 },
      { random: 0.5, attempt: 1, wantMs: 1000 },
      { random: 0.9, attempt: 2, wantMs: 4500 },
    ];
    for (const { random, attempt, wantMs } of cases) {
      Math.random = (() => random) as unknown as typeof Math.random;
      const got = mod.computeBackoffDelayMs(attempt);
      const lo = wantMs * 0.8;
      const hi = wantMs * 1.2 + 1;
      expect(got).toBeGreaterThanOrEqual(lo);
      expect(got).toBeLessThanOrEqual(hi);
    }
    // Cap: requests beyond the ladder fall back to the last entry (5 s).
    Math.random = (() => 1.0) as unknown as typeof Math.random;
    for (const attempt of [10, 50, 1000]) {
      expect(mod.computeBackoffDelayMs(attempt)).toBeLessThanOrEqual(5000);
    }
  });

  it("state machine exposes connecting -> open -> reconnecting -> closed", async () => {
    const mod = await import("../useFactoryStream");
    // TypeScript type aliases are erased at runtime; the strings the source
    // controls are the four state literals. Read the source to assert the
    // shape is present so a future contributor cannot quietly drop a state.
    const fs = await import("fs");
    const path = await import("path");
    const tsSrc = fs.readFileSync(
      path.join(__dirname, "..", "useFactoryStream.ts"),
      "utf8",
    );
    for (const marker of ['"connecting"', '"open"', '"reconnecting"', '"closed"']) {
      expect(tsSrc).toContain(marker);
    }
    // BACKOFF_LADDER_S is exported as a runtime value, also assert it.
    expect(mod.BACKOFF_LADDER_S).toEqual([1, 2, 5, 5, 5]);
    expect(mod.MAX_RECONNECT_ATTEMPTS).toBe(5);
  });
});

