import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createListRequestSchema, createListResponseSchema,
  enterGuestKeyRequestSchema, enterGuestKeyResponseSchema,
  holdItemRequestSchema, holdItemResponseSchema, listViewResponseSchema,
  errorResponseSchema,
} from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import {
  WishlistNotFoundError, InvalidGuestKeyError, ItemNotFoundError, ItemAlreadyHeldError, ConcurrencyError,
} from '../domain/errors.js';
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
    if (payload.wishlistId !== wishlist.id.value || payload.keyGen !== wishlist.keyGen) return null;
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
      reply.code(200).send(enterGuestKeyResponseSchema.parse({ ok: true }));
    } catch (err) {
      // Same generic response for "no such list" and "wrong key" —
      // access-identity.md / ADR-016 / ADR-054 forbid distinguishing them.
      if (err instanceof WishlistNotFoundError || err instanceof InvalidGuestKeyError) {
        reply.code(404).send(errorResponseSchema.parse({ message: 'Not found' }));
        return;
      }
      throw err;
    }
  });

  app.get('/api/lists/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const wishlist = await deps.wishlists.findBySlug(slug);
    if (!wishlist) { reply.code(404).send(errorResponseSchema.parse({ message: 'Not found' })); return; }
    const session = readSession(request, wishlist);
    // Same generic 404 as an unknown slug — ADR-016/054: a caller must not be
    // able to tell "no such list" apart from "list exists, you're just not in
    // it" by status code alone (that would let an unauthenticated prober
    // enumerate valid slugs).
    if (!session) { reply.code(404).send(errorResponseSchema.parse({ message: 'Not found' })); return; }

    // Read through the aggregate: findBySlug already loaded the item and its
    // availability status, so there is no second repository round-trip and no
    // way to render an item that isn't this wishlist's.
    const itemView = wishlist.toItemView();
    if (!itemView) { reply.code(404).send(errorResponseSchema.parse({ message: 'Not found' })); return; }

    reply.send(listViewResponseSchema.parse({
      title: wishlist.title,
      item: itemView,
    }));
  });

  app.post('/api/lists/:slug/items/:itemId/hold', async (request, reply) => {
    const { slug, itemId } = request.params as { slug: string; itemId: string };
    const input = holdItemRequestSchema.parse(request.body);
    const wishlist = await deps.wishlists.findBySlug(slug);
    if (!wishlist) { reply.code(404).send(errorResponseSchema.parse({ message: 'Not found' })); return; }
    const session = readSession(request, wishlist);
    // Same generic 404 as an unknown slug — see the GET route above.
    if (!session) { reply.code(404).send(errorResponseSchema.parse({ message: 'Not found' })); return; }

    // `wishlist` was loaded scoped to this URL's slug, so `wishlist.item` can
    // only ever be *this* wishlist's item or null. There is no query parameter
    // that could make it yield another list's item, which is what makes the
    // cross-wishlist bug class structurally unreachable here rather than
    // merely patched.
    if (wishlist.item?.id.value !== itemId) { reply.code(404).send(errorResponseSchema.parse({ message: 'Not found' })); return; }

    try {
      const result = await deps.holdItem.execute({
        wishlistId: wishlist.id.value, itemId, sessionId: session.sessionId, idempotencyKey: input.idempotencyKey,
      });
      reply.code(201).send(holdItemResponseSchema.parse(result));
    } catch (err) {
      if (err instanceof ItemNotFoundError) { reply.code(404).send(errorResponseSchema.parse({ message: 'Not found' })); return; }
      if (err instanceof ItemAlreadyHeldError) { reply.code(409).send(errorResponseSchema.parse({ message: 'Item already held' })); return; }
      if (err instanceof ConcurrencyError) { reply.code(409).send(errorResponseSchema.parse({ message: 'Item already held' })); return; }
      throw err;
    }
  });
}
