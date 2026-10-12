import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { accessContextFor, readSignedSession, SESSION_COOKIE } from './accessContext.js';
import { HasherSha256 } from '../infrastructure/HasherSha256.js';

const list = { id: '11111111-1111-7111-8111-111111111111', keyGen: 1 };

function requestWith(cookie: string | undefined, unsigned: { valid: boolean; value: string | null }): FastifyRequest {
  return {
    cookies: cookie === undefined ? {} : { [SESSION_COOKIE]: cookie },
    unsignCookie: () => unsigned,
  } as unknown as FastifyRequest;
}

const payload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ wishlistId: list.id, keyGen: list.keyGen, sessionId: 'session-abc', ...overrides });

describe('readSignedSession — what the cookie says, before any list is looked at', () => {
  it('reads a validly signed payload', () => {
    const session = readSignedSession(requestWith('signed', { valid: true, value: payload() }));

    expect(session).toEqual({ wishlistId: list.id, keyGen: 1, sessionId: 'session-abc' });
  });

  it.each([
    ['no cookie', requestWith(undefined, { valid: false, value: null })],
    ['a cookie with a bad signature', requestWith('forged', { valid: false, value: null })],
    ['a payload without a session id', requestWith('signed', { valid: true, value: payload({ sessionId: undefined }) })],
    ['a payload without a list id', requestWith('signed', { valid: true, value: payload({ wishlistId: undefined }) })],
    ['a payload without a key generation', requestWith('signed', { valid: true, value: payload({ keyGen: 'one' }) })],
    ['a cookie that is not JSON', requestWith('signed', { valid: true, value: 'not json' })],
  ])('reads no session from %s', (_name, request) => {
    expect(readSignedSession(request)).toBeNull();
  });
});

describe('accessContextFor — the one place a session becomes credentials', () => {
  const session = { wishlistId: list.id, keyGen: 1, sessionId: 'session-abc' };

  it('hashes a session for this list, so the raw session id goes no further', () => {
    const access = accessContextFor(session, list, new HasherSha256());

    expect(access).toEqual({ guestSession: { sessionHash: createHash('sha256').update('session-abc').digest('hex') } });
    expect(JSON.stringify(access)).not.toContain('session-abc');
  });

  it.each([
    ['no session', null],
    ['a session for another list', { ...session, wishlistId: '22222222-2222-7222-8222-222222222222' }],
    ['a session from before the key was rotated', { ...session, keyGen: 0 }],
  ])('gives no guest credential for %s', (_name, given) => {
    expect(accessContextFor(given, list, new HasherSha256())).toEqual({ guestSession: null });
  });
});
