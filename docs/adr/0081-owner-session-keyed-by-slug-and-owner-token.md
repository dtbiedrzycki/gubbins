# 0081. Owner session is keyed by slug and owner token

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** dtbiedrzycki

## Context

The holds design (D17) keyed owner lookup on an `owner_token_lookup` hash
column, so a bare token could be resolved to a list. `/wishlists/{slug}/manage` already
carries the slug.

## Decision

`/wishlists/{slug}/manage` exchanges the owner token for a signed `gubbins_owner`
cookie via `POST /api/lists/:slug/owner-session`. The route looks the list up
by slug and compares the token in constant time
(ADR-[035](./0035-constant-time-comparison-generalized-to-all-secret.md)).
This amends D17 of the holds design for this route: the slug is in the path,
so no `owner_token_lookup` hash column is needed. The cookie lasts for the
browser session.

## Alternatives considered

- **Token-only lookup via `owner_token_lookup`** — not needed here. A
  token-only paste flow on `/` would still need D17.

## Consequences

- No extra column or index for owner lookup.
- Closing the browser ends the owner session; the owner pastes the token
  again.
