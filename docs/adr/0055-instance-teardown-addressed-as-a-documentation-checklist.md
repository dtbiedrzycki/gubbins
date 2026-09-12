# 0055. Instance teardown addressed as a documentation checklist

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

An active app-level "safe to stop now" signal — a flag or health-endpoint
field that fires once every list on the instance has passed `purgeAt` —
was considered for the operator. The dominant deployment shape (one list
per instance, one operator who is also the owner) already mostly avoids
needing this, per the same reasoning behind
ADR-[014](./0014-list-creation-self-locks-gated-by-createsecret-thereafter.md)'s
self-lock and
ADR-[051](./0051-owner-token-recovery-deferred-direct-operator-access-is-the.md)'s
recovery reasoning.

## Decision

We will address instance teardown as a documentation checklist in the
deployment guide, rather than building an active app-level signal; no
cross-list expiry-monitoring will be built.

## Alternatives considered

- **An active app-level signal** (a flag or health-endpoint field
  indicating every list on the instance has passed `purgeAt`) —
  rejected: it requires scanning across all lists on the instance, extra
  machinery for a case the deployment shape mostly avoids already. It
  would also expose via `/health` or `/metrics` a fact ("nothing left on
  this box") that is itself mildly informative to anyone who can reach
  those endpoints, for a benefit a docs checklist delivers just as well
  to the audience that actually reads setup docs before going live.

## Consequences

- Consistent with the project's general preference
  (ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md),
  ADR-[033](./0033-crypto-shredding-deferred-whole-list-purge-covers-the-need.md),
  ADR-[051](./0051-owner-token-recovery-deferred-direct-operator-access-is-the.md))
  for documentation or a deferred flag over new runtime mechanism when
  the underlying need is operator process, not application behavior.
- No new runtime signal exists for cross-list expiry; operators rely on
  the deployment guide's checklist to know when it's safe to tear down
  an instance.
