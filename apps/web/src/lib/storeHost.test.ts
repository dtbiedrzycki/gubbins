import { describe, expect, it } from 'vitest';
import { storeHost } from './storeHost';

describe('storeHost', () => {
  it('names the site without www', () => {
    expect(storeHost('https://www.vendor.com/item/1')).toBe('vendor.com');
  });

  it('keeps other subdomains', () => {
    expect(storeHost('https://shop.example.co.uk/x')).toBe('shop.example.co.uk');
  });

  it('drops the port and lower-cases the host', () => {
    expect(storeHost('https://WWW.Example.com:8443/x')).toBe('example.com');
  });
});
