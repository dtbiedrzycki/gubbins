import type { FastifyRequest } from 'fastify';
import type { AccessContext } from '../application/AccessContext.js';
import type { Hasher } from '../application/ports/Hasher.js';

export const SESSION_COOKIE = 'gubbins_session';
export const OWNER_COOKIE = 'gubbins_owner';
// Browsers keep Secure cookies only over HTTPS (localhost is exempt); deployments sit behind TLS.
export const SIGNED_COOKIE_OPTIONS = { path: '/', httpOnly: true, signed: true, sameSite: 'strict', secure: true } as const;

export interface OwnerSessionPayload {
  wishlistId: string;
}

export interface SessionPayload {
  wishlistId: string;
  keyGen: number;
  sessionId: string;
}

/**
 * The signed session cookie's payload, if the cookie is validly signed and
 * well formed. This needs no list, so a request without one can be refused
 * before anything is loaded; whether the session is good for a particular
 * list is `accessContextFor`'s question.
 */
export function readSignedSession(request: FastifyRequest): SessionPayload | null {
  const payload = readSignedJson<SessionPayload>(request, SESSION_COOKIE);
  if (typeof payload?.wishlistId !== 'string' || typeof payload.keyGen !== 'number' || typeof payload.sessionId !== 'string') return null;
  return { wishlistId: payload.wishlistId, keyGen: payload.keyGen, sessionId: payload.sessionId };
}

/** The signed owner cookie's payload, if validly signed and well formed. */
export function readOwnerSession(request: FastifyRequest): OwnerSessionPayload | null {
  const payload = readSignedJson<OwnerSessionPayload>(request, OWNER_COOKIE);
  return typeof payload?.wishlistId === 'string' ? { wishlistId: payload.wishlistId } : null;
}

/** A signed cookie's JSON, unchecked; null if missing, badly signed or not JSON. */
function readSignedJson<T>(request: FastifyRequest, name: string): Partial<T> | null {
  const raw = request.cookies[name];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    return JSON.parse(unsigned.value) as Partial<T> | null;
  } catch {
    return null;
  }
}

/**
 * The one place a session becomes an AccessContext. A session from before a
 * key rotation, or for another list, counts as no session at all. The
 * session id is hashed here, so application/ only ever sees the hash that
 * `holds.session_hash` stores — never the raw value.
 */
export function accessContextFor(
  sessions: { guest: SessionPayload | null; owner: OwnerSessionPayload | null },
  list: { id: string; keyGen: number },
  hasher: Hasher,
): AccessContext {
  const session = sessions.guest;
  const valid = session && session.wishlistId === list.id && session.keyGen === list.keyGen;
  return {
    guestSession: valid ? { sessionHash: hasher.hash(session.sessionId) } : null,
    owner: sessions.owner?.wishlistId === list.id,
  };
}
