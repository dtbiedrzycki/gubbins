import { describe, expect, it } from 'vitest';
import { parseCookieSecret, parseCreateSecret } from './secretsConfig.js';

describe('parseCreateSecret', () => {
  it('returns the configured value trimmed', () => {
    expect(parseCreateSecret({ CREATE_SECRET: ' s3cret\n' })).toBe('s3cret');
  });

  it.each([undefined, '', '  '])('refuses to start without one (%j)', (value) => {
    expect(() => parseCreateSecret({ CREATE_SECRET: value })).toThrow(/CREATE_SECRET/);
  });
});

describe('parseCookieSecret', () => {
  it('returns the configured value', () => {
    expect(parseCookieSecret({ SESSION_COOKIE_SECRET: 'abc', NODE_ENV: 'production' })).toBe('abc');
  });

  it('refuses to start in production without one', () => {
    expect(() => parseCookieSecret({ SESSION_COOKIE_SECRET: '', NODE_ENV: 'production' })).toThrow(/SESSION_COOKIE_SECRET/);
  });

  it('allows the development fallback outside production', () => {
    expect(parseCookieSecret({ SESSION_COOKIE_SECRET: '', NODE_ENV: 'development' })).toBeNull();
  });
});
