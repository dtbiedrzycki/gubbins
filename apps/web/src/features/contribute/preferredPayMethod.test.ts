import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPreferredPayMethod, writePreferredPayMethod } from './preferredPayMethod';

describe('preferredPayMethod', () => {
  afterEach(() => vi.restoreAllMocks());

  it('neither reads nor writes throws when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });

    expect(() => writePreferredPayMethod('zelle')).not.toThrow();
    expect(readPreferredPayMethod()).toBeNull();
  });
});
