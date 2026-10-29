import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGifterNames, writeGifterNames } from './gifterNames';

describe('gifterNames', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('neither reads nor writes throws when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });

    expect(() => writeGifterNames('Sam & Alex')).not.toThrow();
    expect(readGifterNames()).toBe('');
  });
});
