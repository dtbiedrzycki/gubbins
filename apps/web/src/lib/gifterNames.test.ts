import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGifterNames, writeGifterNames } from './gifterNames';

describe('gifterNames', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads back the names last written, trimmed', () => {
    writeGifterNames('Amara');
    writeGifterNames('  Sam & Alex ');
    expect(readGifterNames()).toBe('Sam & Alex');
  });

  it('keeps the last names when blank names are written', () => {
    writeGifterNames('Amara');
    writeGifterNames('   ');
    expect(readGifterNames()).toBe('Amara');
  });

  it('reads as empty when no names have been written', () => {
    expect(readGifterNames()).toBe('');
  });

  it('neither reads nor writes throws when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });

    expect(() => writeGifterNames('Sam & Alex')).not.toThrow();
    expect(readGifterNames()).toBe('');
  });
});
