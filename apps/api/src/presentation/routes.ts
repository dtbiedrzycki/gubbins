import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createListRequestSchema, createListResponseSchema,
  enterGuestKeyRequestSchema, holdItemRequestSchema, listViewResponseSchema,
} from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import { WishlistNotFoundError, InvalidGuestKeyError, ItemNotFoundError, ItemAlreadyHeldError } from '../domain/errors.js';
import type { Wishlist } from '../domain/entities/Wishlist.js';

const SESSION_COOKIE = 'gubbins_session';

interface SessionPayload {
  wishlistId: string;
  keyGen: number;
  sessionId: string;
}

function readSession(request: FastifyRequest, wishlist: Wishlist): SessionPayload | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const payload = JSON.parse(unsigned.value) as SessionPayload;
    if (payload.wishlistId !== wishlist.id || payload.keyGen !== wishlist.keyGen) return null;
    return payload;
  } catch {
    return null;
  }
}

export function registerRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.post('/api/lists', async (request, reply) => {
    const input = createListRequestSchema.parse(request.body);
    const result = await deps.createList.execute(input);
    reply.code(201).send(createListResponseSchema.parse(result));
  });

  app.post('/api/lists/:slug/session', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const input = enterGuestKeyRequestSchema.parse(request.body);
    try {
      const result = await deps.enterGuestKey.execute({ slug, key: input.key });
      const payload: SessionPayload = { wishlistId: result.wishlistId, keyGen: result.keyGen, sessionId: result.sessionId };
      reply.setCookie(SESSION_COOKIE, JSON.stringify(payload), { path: '/', httpOnly: true, signed: true, sameSite: 'strict' });
      reply.code(200).send({ ok: true });
    } catch (err) {
      // Same generic response for "no such list" and "wrong key" —
      // access-identity.md / ADR-016 / ADR-054 forbid distinguishing them.
      if (err instanceof WishlistNotFoundError || err instanceof InvalidGuestKeyError) {
        reply.code(404).send({ message: 'Not found' });
        return;
      }
      throw err;
    }
  });

  app.get('/api/lists/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const wishlist = await deps.wishlists.findBySlug(slug);
    if (!wishlist) { reply.code(404).send({ message: 'Not found' }); return; }
    const session = readSession(request, wishlist);
    if (!session) { reply.code(401).send({ message: 'Not found' }); return; }

    const item = await deps.items.findByWishlistId(wishlist.id);
    if (!item) { reply.code(404).send({ message: 'Not found' }); return; }
    const state = await deps.items.getState(item.id);

    reply.send(listViewResponseSchema.parse({
      title: wishlist.title,
      item: { id: item.id, title: item.title, status: state.status },
    }));
  });

  app.post('/api/lists/:slug/items/:itemId/hold', async (request, reply) => {
    const { slug, itemId } = request.params as { slug: string; itemId: string };
    const input = holdItemRequestSchema.parse(request.body);
    const wishlist = await deps.wishlists.findBySlug(slug);
    if (!wishlist) { reply.code(404).send({ message: 'Not found' }); return; }
    const session = readSession(request, wishlist);
    if (!session) { reply.code(401).send({ message: 'Not found' }); return; }

    try {
      const result = await deps.holdItem.execute({ itemId, sessionId: session.sessionId, idempotencyKey: input.idempotencyKey });
      reply.code(201).send(result);
    } catch (err) {
      if (err instanceof ItemNotFoundError) { reply.code(404).send({ message: 'Not found' }); return; }
      if (err instanceof ItemAlreadyHeldError) { reply.code(409).send({ message: 'Item already held' }); return; }
      throw err;
    }
  });
}
