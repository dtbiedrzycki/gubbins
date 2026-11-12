import { describe, expect, it } from 'vitest';
import { readFragmentKey } from './fragmentKey';

describe('readFragmentKey', () => {
  it.each([
    ['a key alone', '#key=maple-lantern-otter', 'maple-lantern-otter', ''],
    ['a key beside other content', '#key=maple-lantern-otter&foo=bar', 'maple-lantern-otter', '#foo=bar'],
  ])('takes the key from %s', (_, hash, key, rest) => {
    expect(readFragmentKey(hash)).toEqual({ key, rest });
  });

  it.each([
    ['there is no fragment', '', ''],
    ['the key is empty', '#key=', ''],
    ['the key is not valid percent-encoding', '#key=%E0', ''],
    ['there is only other content', '#foo=bar', '#foo=bar'],
  ])('finds no key when %s', (_, hash, rest) => {
    expect(readFragmentKey(hash)).toEqual({ key: null, rest });
  });
});
