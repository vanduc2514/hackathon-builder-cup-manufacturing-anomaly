import { describe, expect, it } from 'vitest';
import { formatOrderTimestamp, formatTime } from '../mobileData';

describe('mobileData timestamp formatters', () => {
  it('formatTime parses ISO strings into local 24h time', () => {
    expect(formatTime(null)).toBe('');
    expect(formatTime(undefined)).toBe('');

    const iso = '2026-10-18T09:10:14Z';
    const formatted = formatTime(iso);
    expect(formatted).toMatch(/^\d{2}:\d{2}$/);

    const expectedHour = new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    expect(formatted).toBe(expectedHour);
  });

  it('formatTime passes through clean time strings', () => {
    expect(formatTime('09:10:14')).toBe('09:10:14');
    expect(formatTime('14:30')).toBe('14:30');
  });

  it('formatOrderTimestamp formats today as HH:mm:ss without subsecond noise', () => {
    expect(formatOrderTimestamp(null)).toBe('');
    expect(formatOrderTimestamp(undefined)).toBe('');

    const now = new Date();
    const formatted = formatOrderTimestamp(now.toISOString());
    expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('formatOrderTimestamp cleans raw ISO string from past days without cut-off plus signs', () => {
    const pastIso = '2026-10-17T23:55:47.220453+00:00';
    const formatted = formatOrderTimestamp(pastIso);
    expect(formatted).not.toContain('+');
    expect(formatted).not.toContain('220453');
  });
});
