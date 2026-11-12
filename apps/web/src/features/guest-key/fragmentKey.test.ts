import { describe, expect, it } from 'vitest';
import { readFragmentKey } from './fragmentKey';

describe('readFragmentKey', () => {
  it.each([
    ['a key alone', '#key=maple-lantern-otter', 'maple-lantern-otter', ''],
    ['a key beside other content', '#key=maple-lantern-otter&foo=bar', 'maple-lantern-otter', '#foo=bar'],
    ['no fragment', '', null, ''],
    ['an empty key', '#key=', null, ''],
    ['a key that is not valid percent-encoding', '#key=%E0', null, ''],
    ['other content only', '#foo=bar', null, '#foo=bar'],
  ])('reads %s', (_, hash, key, rest) => {
    expect(readFragmentKey(hash)).toEqual({ key, rest });
  });
});
