import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { buildAccessContext, SESSION_COOKIE } from './accessContext.js';
import { HasherSha256 } from '../infrastructure/HasherSha256.js';
import { aWishlist } from '../application/test-fakes/builders.js';

const wishlist = aWishlist().build();

function requestWith(cookie: string | undefined, unsigned: { valid: boolean; value: string | null }): FastifyRequest {
  return {
    cookies: cookie === undefined ? {} : { [SESSION_COOKIE]: cookie },
    unsignCookie: () => unsigned,
  } as unknown as FastifyRequest;
}

const payload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ wishlistId: wishlist.id.value, keyGen: wishlist.keyGen, sessionId: 'session-abc', ...overrides });

describe('buildAccessContext — the one place a request becomes credentials (D7)', () => {
  it('hashes a valid session for this list, so the raw session id goes no further', () => {
    const access = buildAccessContext(requestWith('signed', { valid: true, value: payload() }), wishlist, new HasherSha256());

    expect(access).toEqual({ guestSession: { sessionHash: createHash('sha256').update('session-abc').digest('hex') } });
    expect(JSON.stringify(access)).not.toContain('session-abc');
  });

  it.each([
    ['no cookie', requestWith(undefined, { valid: false, value: null })],
    ['a cookie with a bad signature', requestWith('forged', { valid: false, value: null })],
    ['a session for another list', requestWith('signed', { valid: true, value: payload({ wishlistId: '22222222-2222-7222-8222-222222222222' }) })],
    ['a session from before the key was rotated', requestWith('signed', { valid: true, value: payload({ keyGen: 0 }) })],
    ['a payload without a session id', requestWith('signed', { valid: true, value: payload({ sessionId: undefined }) })],
    ['a cookie that is not JSON', requestWith('signed', { valid: true, value: 'not json' })],
  ])('gives no guest credential for %s', (_name, request) => {
    expect(buildAccessContext(request, wishlist, new HasherSha256())).toEqual({ guestSession: null });
  });
});
