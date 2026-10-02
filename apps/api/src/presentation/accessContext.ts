import type { FastifyRequest } from 'fastify';
import type { AccessContext } from '../application/AccessContext.js';
import type { Hasher } from '../application/ports/Hasher.js';
import type { Wishlist } from '../domain/entities/Wishlist.js';

export const SESSION_COOKIE = 'gubbins_session';

export interface SessionPayload {
  wishlistId: string;
  keyGen: number;
  sessionId: string;
}

/**
 * The signed session cookie's payload, if it is valid for *this* wishlist
 * at its current key generation — a session from before a key rotation, or
 * for another list, counts as no session at all.
 */
export function readSession(request: FastifyRequest, wishlist: Wishlist): SessionPayload | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const payload = JSON.parse(unsigned.value) as Partial<SessionPayload>;
    if (payload.wishlistId !== wishlist.id.value || payload.keyGen !== wishlist.keyGen) return null;
    if (typeof payload.sessionId !== 'string') return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * The one place a request's credentials become an AccessContext
 * (holds-lifecycle D7). The session id is hashed here, so application/
 * only ever sees the hash that `holds.session_hash` stores — never the raw
 * value (holds spec).
 */
export function buildAccessContext(request: FastifyRequest, wishlist: Wishlist, hasher: Hasher): AccessContext {
  const session = readSession(request, wishlist);
  return { guestSession: session ? { sessionHash: hasher.hash(session.sessionId) } : null };
}
