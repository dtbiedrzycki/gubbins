import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createListRequestSchema, createListResponseSchema,
  enterGuestKeyRequestSchema, enterGuestKeyResponseSchema,
  ownerSessionRequestSchema, ownerSessionResponseSchema,
  addItemRequestSchema, addItemResponseSchema,
  holdItemRequestSchema, holdItemResponseSchema, holdViewSchema, listViewResponseSchema,
  pledgeRequestSchema, pledgeResponseSchema,
  errorResponseSchema,
} from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import type { AccessContext } from '../application/AccessContext.js';
import type { HoldCommand } from '../application/use-cases/holdCommand.js';
import type { Wishlist } from '../domain/entities/Wishlist.js';
import { WishlistNotFoundError, InvalidGuestKeyError } from '../domain/errors.js';
import { OWNER_COOKIE, SESSION_COOKIE, accessContextFor, readOwnerSession, readSignedSession, type OwnerSessionPayload, type SessionPayload } from './accessContext.js';
import { NOT_FOUND, domainErrorResponse } from './domainErrorResponse.js';

// Path parameters are an HTTP concern, so their schemas live here rather than
// in @gubbins/shared-types (which holds request/response bodies only).
const slugParams = z.object({ slug: z.string() });
const slugItemParams = z.object({ slug: z.string(), itemId: z.string() });
const slugHoldParams = z.object({ slug: z.string(), holdId: z.string() });

// One shared component in the OpenAPI document instead of the error body
// inlined into every 4xx response.
z.globalRegistry.add(errorResponseSchema, { id: 'ErrorResponse' });

/** A JSON response with the description OpenAPI shows for its status. */
function json<T extends z.ZodType>(description: string, schema: T) {
  return { description, content: { 'application/json': { schema } } };
}

const INVALID_REQUEST = 'The request did not match the schema.';
const HOLD_NOT_FOUND = "No such list or hold, no valid session for the list, or the hold is not this session's. These are deliberately indistinguishable (ADR-0016, ADR-0054).";

export function registerRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * The URL's list and the guest session presented for it, or null — which
   * every guest route answers with the same generic 404 as an unknown slug:
   * a caller must not tell "no such list" from "list exists, you're not in
   * it", or slugs could be enumerated (ADR-0016/0054). A request without a
   * validly signed session is refused before any list is loaded.
   */
  async function guestAccess(request: FastifyRequest, slug: string): Promise<{ wishlist: Wishlist; access: AccessContext } | null> {
    const session = readSignedSession(request);
    if (!session) return null;
    const wishlist = await deps.wishlists.findBySlug(slug, deps.clock.now());
    if (!wishlist) return null;
    const access = accessContextFor({ guest: session, owner: null }, { id: wishlist.id.value, keyGen: wishlist.keyGen }, deps.hasher);
    return access.guestSession ? { wishlist, access } : null;
  }

  /** Like guestAccess, for the owner cookie: the list, or null for the same generic 404. */
  async function ownerAccess(request: FastifyRequest, slug: string): Promise<{ wishlist: Wishlist; access: AccessContext } | null> {
    const owner = readOwnerSession(request);
    if (!owner) return null;
    const wishlist = await deps.wishlists.findBySlug(slug, deps.clock.now());
    if (!wishlist) return null;
    const access = accessContextFor({ guest: readSignedSession(request), owner }, { id: wishlist.id.value, keyGen: wishlist.keyGen }, deps.hasher);
    return access.owner ? { wishlist, access } : null;
  }

  /** Answers a domain error with its mapped status, or rethrows it for the generic 500 handler. */
  function sendDomainError(reply: FastifyReply, err: unknown) {
    const mapped = domainErrorResponse(err);
    if (!mapped) throw err;
    return reply.code(mapped.status).send(mapped.body);
  }

  app.post('/api/lists', {
    schema: {
      operationId: 'createList',
      body: createListRequestSchema,
      response: {
        201: json('The list was created.', createListResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        403: json('The create secret was missing or wrong (ADR-0080).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    try {
      const result = await deps.createList.execute(request.body);
      return reply.code(201).send(result);
    } catch (err) {
      return sendDomainError(reply, err);
    }
  });

  app.post('/api/lists/:slug/session', {
    schema: {
      operationId: 'enterGuestKey',
      params: slugParams,
      body: enterGuestKeyRequestSchema,
      response: {
        200: json('The key was accepted and a session cookie was set.', enterGuestKeyResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        404: json('No such list, or the key is wrong. The two are deliberately indistinguishable (ADR-0016, ADR-0054).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    try {
      const result = await deps.enterGuestKey.execute({ slug, key: request.body.key });
      const payload: SessionPayload = { wishlistId: result.wishlistId, keyGen: result.keyGen, sessionId: result.sessionId };
      // Browsers keep Secure cookies only over HTTPS (localhost is exempt); deployments sit behind TLS.
      reply.setCookie(SESSION_COOKIE, JSON.stringify(payload), { path: '/', httpOnly: true, signed: true, sameSite: 'strict', secure: true });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      // Same generic response for "no such list" and "wrong key" —
      // access-identity.md / ADR-0016 / ADR-0054 forbid distinguishing them.
      if (err instanceof WishlistNotFoundError || err instanceof InvalidGuestKeyError) {
        return reply.code(404).send(NOT_FOUND);
      }
      throw err;
    }
  });

  app.post('/api/lists/:slug/owner-session', {
    schema: {
      operationId: 'enterOwnerToken',
      params: slugParams,
      body: ownerSessionRequestSchema,
      response: {
        200: json('The token was accepted and an owner cookie was set.', ownerSessionResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        404: json('No such list, or the token is wrong. Deliberately indistinguishable (ADR-0016, ADR-0054).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    try {
      const { wishlistId } = await deps.enterOwnerToken.execute({ slug: request.params.slug, ownerToken: request.body.ownerToken });
      const payload: OwnerSessionPayload = { wishlistId };
      reply.setCookie(OWNER_COOKIE, JSON.stringify(payload), { path: '/', httpOnly: true, signed: true, sameSite: 'strict', secure: true });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      return sendDomainError(reply, err);
    }
  });

  app.get('/api/lists/:slug', {
    schema: {
      operationId: 'getListView',
      params: slugParams,
      response: {
        200: json("The list, its item, this session's holds, and what this server does for guests.", listViewResponseSchema),
        404: json('No such list, or no valid session for it. The two are deliberately indistinguishable (ADR-0016, ADR-0054).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const guest = await guestAccess(request, request.params.slug);
    if (!guest) return reply.code(404).send(NOT_FOUND);
    try {
      const view = await deps.getListView.execute({ wishlistId: guest.wishlist.id.value }, guest.access);
      return reply.code(200).send(view);
    } catch (err) {
      return sendDomainError(reply, err);
    }
  });

  app.post('/api/lists/:slug/items', {
    schema: {
      operationId: 'addItem',
      params: slugParams,
      body: addItemRequestSchema,
      response: {
        201: json('The item was added to the list.', addItemResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        404: json('No such list, or no owner cookie for it. Deliberately indistinguishable (ADR-0016, ADR-0054).', errorResponseSchema),
        409: json('A group gift needs a payment method on the list (no_payment_method).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const owner = await ownerAccess(request, request.params.slug);
    if (!owner) return reply.code(404).send(NOT_FOUND);
    try {
      const result = await deps.addItem.execute({ ...request.body, wishlistId: owner.wishlist.id.value }, owner.access);
      return reply.code(201).send(result);
    } catch (err) {
      return sendDomainError(reply, err);
    }
  });

  app.post('/api/lists/:slug/items/:itemId/hold', {
    schema: {
      operationId: 'holdItem',
      params: slugItemParams,
      body: holdItemRequestSchema,
      response: {
        201: json('The item is now held for this session; a replayed idempotency key returns the same hold.', holdItemResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        404: json('No such list or item, or no valid session for the list. These are deliberately indistinguishable (ADR-0016, ADR-0054).', errorResponseSchema),
        409: json('No unit of the item is free (item_unavailable), or a concurrent change won (no code).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const { slug, itemId } = request.params;
    const guest = await guestAccess(request, slug);
    if (!guest) return reply.code(404).send(NOT_FOUND);
    try {
      // The use case loads the wishlist this slug resolved to and asks it for
      // the item, so another list's item id is ItemNotFoundError — a 404.
      const view = await deps.holdItem.execute({ wishlistId: guest.wishlist.id.value, itemId, idempotencyKey: request.body.idempotencyKey, name: request.body.name, message: request.body.message }, guest.access);
      return reply.code(201).send(view);
    } catch (err) {
      return sendDomainError(reply, err);
    }
  });

  app.post('/api/lists/:slug/items/:itemId/contributions', {
    schema: {
      operationId: 'pledgeContribution',
      params: slugItemParams,
      body: pledgeRequestSchema,
      response: {
        201: json('The pledge was recorded; a replayed idempotency key returns the original.', pledgeResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        404: json('No such list or item, or no valid session for the list. These are deliberately indistinguishable (ADR-0016, ADR-0054).', errorResponseSchema),
        409: json('The item is not a group gift (item_unavailable), the amount is out of range (amount_out_of_range), or a concurrent change won (no code).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const { slug, itemId } = request.params;
    const guest = await guestAccess(request, slug);
    if (!guest) return reply.code(404).send(NOT_FOUND);
    try {
      const result = await deps.pledgeContribution.execute({ ...request.body, wishlistId: guest.wishlist.id.value, itemId }, guest.access);
      return reply.code(201).send(result);
    } catch (err) {
      return sendDomainError(reply, err);
    }
  });

  const holdCommands: { action: 'extend' | 'release' | 'purchase'; operationId: string; command: HoldCommand; done: string; conflict: string }[] = [
    {
      action: 'extend', operationId: 'extendHold', command: deps.extendHold,
      done: 'The hold was extended once, by the configured duration, from its current expiry.',
      conflict: 'The hold is not active (hold_not_active) or was already extended (hold_already_extended).',
    },
    {
      action: 'release', operationId: 'releaseHold', command: deps.releaseHold,
      done: 'The hold was released; its unit is free for others.',
      conflict: 'The hold is not active (hold_not_active).',
    },
    {
      action: 'purchase', operationId: 'markHoldPurchased', command: deps.markHoldPurchased,
      done: 'The hold was marked purchased.',
      conflict: 'The hold was already released or purchased (hold_not_active), or it expired and no unit is free any more (item_unavailable).',
    },
  ];

  // No request body: the session cookie is the only credential for now.
  for (const { action, operationId, command, done, conflict } of holdCommands) {
    app.post(`/api/lists/:slug/holds/:holdId/${action}`, {
      schema: {
        operationId,
        params: slugHoldParams,
        response: {
          200: json(done, holdViewSchema),
          404: json(HOLD_NOT_FOUND, errorResponseSchema),
          409: json(conflict, errorResponseSchema),
        },
      },
    }, async (request, reply) => {
      const guest = await guestAccess(request, request.params.slug);
      if (!guest) return reply.code(404).send(NOT_FOUND);
      try {
        const view = await command.execute({ wishlistId: guest.wishlist.id.value, holdId: request.params.holdId }, guest.access);
        return reply.code(200).send(view);
      } catch (err) {
        return sendDomainError(reply, err);
      }
    });
  }
}
