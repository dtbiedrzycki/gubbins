import { describe, expect, it } from 'vitest';
import { parseCookieSecret, parseCreateSecret } from './secretsConfig.js';

describe('parseCreateSecret', () => {
  it('returns the configured value trimmed', () => {
    expect(parseCreateSecret({ CREATE_SECRET: ' s3cret\n' })).toBe('s3cret');
  });

  it.each([undefined, '', '  '])('refuses to start when CREATE_SECRET is unset, empty or only whitespace (%j)', (value) => {
    expect(() => parseCreateSecret({ CREATE_SECRET: value })).toThrow(/CREATE_SECRET/);
  });
});

describe('parseCookieSecret', () => {
  it('returns the configured value trimmed', () => {
    expect(parseCookieSecret({ SESSION_COOKIE_SECRET: ' abc\n', NODE_ENV: 'production' })).toBe('abc');
  });

  it.each([undefined, '', '  '])('refuses to start in production when SESSION_COOKIE_SECRET is unset, empty or only whitespace (%j)', (value) => {
    expect(() => parseCookieSecret({ SESSION_COOKIE_SECRET: value, NODE_ENV: 'production' })).toThrow(/SESSION_COOKIE_SECRET/);
  });

  it('allows the development fallback outside production', () => {
    expect(parseCookieSecret({ SESSION_COOKIE_SECRET: '', NODE_ENV: 'development' })).toBeNull();
  });
});
