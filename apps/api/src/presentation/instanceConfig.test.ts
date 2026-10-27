import { describe, expect, it } from 'vitest';
import { DEFAULT_SOURCE_URL, parseInstanceConfig } from './instanceConfig.js';

describe('parseInstanceConfig', () => {
  it.each([undefined, '', '   '])('uses the default source URL when SOURCE_URL is %j', (SOURCE_URL) => {
    expect(parseInstanceConfig({ SOURCE_URL }).sourceUrl).toBe(DEFAULT_SOURCE_URL);
  });

  it('returns a set source URL trimmed', () => {
    expect(parseInstanceConfig({ SOURCE_URL: '  https://example.com/fork \n' }).sourceUrl).toBe('https://example.com/fork');
  });

  it.each(['not a url', 'ftp://example.com/x', 'javascript:alert(1)'])('stops startup when SOURCE_URL is %j', (SOURCE_URL) => {
    expect(() => parseInstanceConfig({ SOURCE_URL })).toThrow(/SOURCE_URL/);
  });

  it('returns the privacy contact trimmed, and null when unset or blank', () => {
    expect(parseInstanceConfig({ PRIVACY_CONTACT: ' me@example.com ' }).privacyContact).toBe('me@example.com');
    expect(parseInstanceConfig({ PRIVACY_CONTACT: '  ' }).privacyContact).toBeNull();
    expect(parseInstanceConfig({}).privacyContact).toBeNull();
  });
});
