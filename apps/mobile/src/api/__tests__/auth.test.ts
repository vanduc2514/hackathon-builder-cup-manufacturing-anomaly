import { describe, it, expect } from 'vitest';
import { readPasswordParam } from '../auth';

describe('readPasswordParam', () => {
  it('returns empty password and empty search when no query string', () => {
    expect(readPasswordParam('')).toEqual({ password: '', cleanedSearch: '' });
  });

  it('extracts ?pwd=secret and strips it from the search string', () => {
    expect(readPasswordParam('?pwd=secret')).toEqual({ password: 'secret', cleanedSearch: '' });
  });

  it('preserves other query parameters and removes only pwd', () => {
    expect(readPasswordParam('?pwd=secret&keep=this')).toEqual({
      password: 'secret',
      cleanedSearch: '?keep=this',
    });
  });

  it('preserves other params when pwd appears after them', () => {
    expect(readPasswordParam('?other=1&pwd=secret')).toEqual({
      password: 'secret',
      cleanedSearch: '?other=1',
    });
  });

  it('is idempotent: re-parsing a cleaned string returns empty password', () => {
    const first = readPasswordParam('?pwd=secret&keep=this');
    expect(first.password).toBe('secret');
    expect(first.cleanedSearch).toBe('?keep=this');
    const second = readPasswordParam(first.cleanedSearch);
    expect(second.password).toBe('');
    expect(second.cleanedSearch).toBe('?keep=this');
  });
});