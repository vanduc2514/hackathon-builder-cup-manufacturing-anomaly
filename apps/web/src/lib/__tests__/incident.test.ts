import { describe, expect, it } from 'vitest';
import { computeIncidentDuration, formatLocalClock } from '../incident';

describe('incident date and time helpers', () => {
  it('formatLocalClock formats ISO timestamps to local HH:mm', () => {
    expect(formatLocalClock(null)).toBe('--:--');
    expect(formatLocalClock(undefined)).toBe('--:--');

    const iso = '2026-10-18T09:10:14Z';
    const formatted = formatLocalClock(iso);
    expect(formatted).toMatch(/^\d{2}:\d{2}$/);
    const expected = new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    expect(formatted).toBe(expected);
  });

  it('formatLocalClock with includeSeconds formats to local HH:mm:ss', () => {
    const iso = '2026-10-18T09:10:14Z';
    const formatted = formatLocalClock(iso, true);
    expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    const expected = new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    expect(formatted).toBe(expected);
  });

  it('computeIncidentDuration computes elapsed time accurately without timezone drift', () => {
    const t0 = new Date('2026-10-18T09:10:00Z').toISOString();
    const t1 = new Date('2026-10-18T09:13:15Z').toISOString();

    const duration = computeIncidentDuration(t0, t1);
    expect(duration).toBe('3m 15s');
  });
});
