import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createListRequestSchema, createListResponseSchema,
  enterGuestKeyRequestSchema, enterGuestKeyResponseSchema,
  holdItemRequestSchema, holdItemResponseSchema, listViewResponseSchema,
  errorResponseSchema,
} from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import { WishlistNotFoundError, InvalidGuestKeyError } from '../domain/errors.js';
import { SESSION_COOKIE, buildAccessContext, type SessionPayload } from './accessContext.js';
import { NOT_FOUND, domainErrorResponse } from './domainErrorResponse.js';

// Path parameters are an HTTP concern, so their schemas live here rather than
// in @gubbins/shared-types (which holds request/response bodies only).
const slugParams = z.object({ slug: z.string() });
const slugItemParams = z.object({ slug: z.string(), itemId: z.string() });

// One shared component in the OpenAPI document instead of the error body
// inlined into every 4xx response.
z.globalRegistry.add(errorResponseSchema, { id: 'ErrorResponse' });

/** A JSON response with the description OpenAPI shows for its status. */
function json<T extends z.ZodType>(description: string, schema: T) {
  return { description, content: { 'application/json': { schema } } };
}

const INVALID_REQUEST = 'The request did not match the schema.';

export function registerRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post('/api/lists', {
    schema: {
      operationId: 'createList',
      body: createListRequestSchema,
      response: {
        201: json('The list was created.', createListResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const result = await deps.createList.execute(request.body);
    return reply.code(201).send(result);
  });

  app.post('/api/lists/:slug/session', {
    schema: {
      operationId: 'enterGuestKey',
      params: slugParams,
      body: enterGuestKeyRequestSchema,
      response: {
        200: json('The key was accepted and a session cookie was set.', enterGuestKeyResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        404: json('No such list, or the key is wrong. The two are deliberately indistinguishable (ADR-016, ADR-054).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    try {
      const result = await deps.enterGuestKey.execute({ slug, key: request.body.key });
      const payload: SessionPayload = { wishlistId: result.wishlistId, keyGen: result.keyGen, sessionId: result.sessionId };
      reply.setCookie(SESSION_COOKIE, JSON.stringify(payload), { path: '/', httpOnly: true, signed: true, sameSite: 'strict' });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      // Same generic response for "no such list" and "wrong key" —
      // access-identity.md / ADR-016 / ADR-054 forbid distinguishing them.
      if (err instanceof WishlistNotFoundError || err instanceof InvalidGuestKeyError) {
        return reply.code(404).send(NOT_FOUND);
      }
      throw err;
    }
  });

  app.get('/api/lists/:slug', {
    schema: {
      operationId: 'getListView',
      params: slugParams,
      response: {
        200: json('The list and its item.', listViewResponseSchema),
        404: json('No such list, or no valid session for it. The two are deliberately indistinguishable (ADR-016, ADR-054).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const wishlist = await deps.wishlists.findBySlug(request.params.slug, deps.clock.now());
    if (!wishlist) return reply.code(404).send(NOT_FOUND);
    const access = buildAccessContext(request, wishlist, deps.hasher);
    // Same generic 404 as an unknown slug — ADR-016/054: a caller must not be
    // able to tell "no such list" apart from "list exists, you're just not in
    // it" by status code alone (that would let an unauthenticated prober
    // enumerate valid slugs).
    if (!access.guestSession) return reply.code(404).send(NOT_FOUND);

    // Read through the aggregate: findBySlug already loaded the item and its
    // availability status, so there is no second repository round-trip and no
    // way to render an item that isn't this wishlist's. Shaping the response
    // is presentation's job — the domain no longer owns a view of itself.
    const item = wishlist.item;
    if (!item) return reply.code(404).send(NOT_FOUND);

    return reply.code(200).send({
      title: wishlist.title,
      item: { id: item.id.value, title: item.title, status: wishlist.itemStatus(item.id.value) },
    });
  });

  app.post('/api/lists/:slug/items/:itemId/hold', {
    schema: {
      operationId: 'holdItem',
      params: slugItemParams,
      body: holdItemRequestSchema,
      response: {
        201: json('The item is now held for this session.', holdItemResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        404: json('No such list or item, or no valid session for the list. These are deliberately indistinguishable (ADR-016, ADR-054).', errorResponseSchema),
        409: json('No unit of the item is free (item_unavailable), or a concurrent change won (no code).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const { slug, itemId } = request.params;
    const wishlist = await deps.wishlists.findBySlug(slug, deps.clock.now());
    if (!wishlist) return reply.code(404).send(NOT_FOUND);
    const access = buildAccessContext(request, wishlist, deps.hasher);
    // Same generic 404 as an unknown slug — see the GET route above.
    if (!access.guestSession) return reply.code(404).send(NOT_FOUND);

    // `wishlist` was loaded scoped to this URL's slug, so `wishlist.item` can
    // only ever be *this* wishlist's item or null. There is no query parameter
    // that could make it yield another list's item, which is what makes the
    // cross-wishlist bug class structurally unreachable here rather than
    // merely patched.
    if (wishlist.item?.id.value !== itemId) return reply.code(404).send(NOT_FOUND);

    try {
      const view = await deps.holdItem.execute({ wishlistId: wishlist.id.value, itemId, idempotencyKey: request.body.idempotencyKey }, access);
      // PR 6 widens the response to the full hold view; until then, the skeleton's three fields.
      return reply.code(201).send({ holdId: view.holdId, itemId: view.itemId, expiresAt: view.expiresAt });
    } catch (err) {
      const mapped = domainErrorResponse(err);
      if (mapped) return reply.code(mapped.status).send(mapped.body);
      throw err;
    }
  });
}
