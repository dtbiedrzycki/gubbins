import { describe, expect, it } from 'vitest';
import { storeHost } from './storeHost';

describe('storeHost', () => {
  it('names the site without www', () => {
    expect(storeHost('https://www.vendor.com/item/1')).toBe('vendor.com');
  });

  it('keeps other subdomains', () => {
    expect(storeHost('https://shop.example.co.uk/x')).toBe('shop.example.co.uk');
  });

  it('drops the port', () => {
    expect(storeHost('https://vendor.com:8443/x')).toBe('vendor.com');
  });

  it('strips an upper-case WWW, since the URL parser lower-cases the host first', () => {
    expect(storeHost('https://WWW.Vendor.com/x')).toBe('vendor.com');
  });
});
