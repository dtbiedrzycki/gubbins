# 0015. Owner tokens are shared per list, not per-owner

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

There are no accounts anywhere in the system
(ADR-[001](./0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md)),
and a list can legitimately have more than one owner in practice — a
couple planning a shared event, for instance. A decision was needed on
whether owner access should be one bearer secret per list or something
finer-grained per individual owner.

## Decision

We will issue a single owner token per list, shared by all co-owners,
with no per-owner identity underneath it. Compromise, or a change in who
should have access, is handled by **rotating** that one token, not by
issuing additional tokens
([access & identity](../spec/access-identity.md)).

## Alternatives considered

- **N tokens per list, one per co-owner** — rejected: there is no
  per-owner identity anywhere in the system, so distinguishable
  per-owner tokens would add a token-issuance and -management surface
  (tracking who holds which token, revoking one without affecting
  others) without any accountability benefit to attach it to, since
  nothing inside owner access distinguishes "this owner" from "that
  owner" once authenticated.
- **Issuing an additional token on compromise, alongside the existing
  one** — rejected: leaves the compromised token valid. Rotation
  invalidates it directly, which is what a compromise actually requires.

## Consequences

- Co-owners share one credential and one "save your owner token" screen
  at list creation; there is nothing to individually provision or
  revoke per person.
- A single rotation event covers every co-owner at once — there is no
  way to revoke one co-owner's access while leaving another's intact,
  since the token carries no per-owner distinction to revoke against.
- Rotation preserves all claim history, so compromise recovery or a
  change in who has access never requires touching the list's data.
