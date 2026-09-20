# 0001. No accounts; slug + key for guests, owner token for owners

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The project's first design principle ([overview](../../gubbins-spec.md#design-principles))
is that nobody registers to give or receive: guests claim items or
contribute without creating an account, and an owner runs their list
without one either. The service is aimed at a single event's worth of
casual, often one-time participants (a wedding or baby-shower guest list)
rather than returning users who'd benefit from a persistent identity, and
self-hosters want a ten-minute setup, not an accounts subsystem to operate.

## Decision

We will not build user accounts anywhere in the system. Guest access is an
unguessable slug (in the URL) plus a shared, human-readable key entered
once; owner access is a single shared owner token per list, with no
per-owner identity underneath it. Both are bearer secrets — whoever holds
one has full access at that level.

## Alternatives considered

- **Per-guest accounts (registration/login)** — rejected: adds signup
  friction contrary to the no-accounts design principle, and a wedding or
  baby-shower guest list has no ongoing use for a persistent guest identity.
- **Per-owner accounts (username/password or SSO)** — rejected: a list has
  no need for multiple distinguishable owner identities (co-owners share
  one token, ADR-[015](./0015-owner-tokens-are-shared-per-list-not-per-owner.md)),
  so individual login credentials would add an accounts subsystem to
  build, secure, and operate without an accountability benefit to attach
  it to.

## Consequences

- No password resets, no user database, no per-person session state
  anywhere in the system.
- Access control is entirely secret-possession-based: anyone holding the
  slug+key or the owner token has full access at that level. Protecting
  those secrets in transit and storage becomes its own line of decisions
  (ADR-[064](./0064-the-owner-token-never-travels-in-a-url.md): owner token
  never travels in a URL; ADR-[069](./0069-the-guest-key-travels-in-a-fragment.md):
  guest key travels in a fragment; ADR-[054](./0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md):
  guest key stored in plaintext).
- No durable cross-session guest identity exists, which later decisions
  must design around rather than assume — e.g. ADR-[060](./0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)'s
  guest self-service data access is scoped per session, not per person,
  because there is no "per person" to scope to.
