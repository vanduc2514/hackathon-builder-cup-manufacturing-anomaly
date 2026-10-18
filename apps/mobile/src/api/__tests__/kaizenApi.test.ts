import { afterEach, describe, expect, it, vi } from 'vitest';
import { postRepairDone } from '../kaizenApi';

const authFetch = vi.hoisted(() => vi.fn());
vi.mock('../auth', () => ({ authFetch, withToken: (u: string) => u }));

afterEach(() => authFetch.mockReset());

describe('postRepairDone', () => {
  it('POSTs the relative repair-done URL and returns the incident state', async () => {
    authFetch.mockResolvedValue({ ok: true, json: async () => ({ state: { status: 'repairing' } }) });
    await expect(postRepairDone()).resolves.toEqual({ status: 'repairing' });
    expect(authFetch).toHaveBeenCalledWith('/api/incidents/repair-done', { method: 'POST' });
  });

  it('surfaces the 409 detail from the backend', async () => {
    authFetch.mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ detail: 'The AI is not waiting for a repair confirmation right now' }),
    });
    await expect(postRepairDone()).rejects.toThrow('The AI is not waiting for a repair confirmation right now');
  });
});
