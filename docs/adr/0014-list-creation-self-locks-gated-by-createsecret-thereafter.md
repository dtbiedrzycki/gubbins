# 0014. List creation self-locks; gated by CREATE_SECRET thereafter

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The instance is inherently public-facing — guests need unauthenticated
access to their list, so the app can't simply require auth everywhere —
which means unrestricted list creation would let anyone on the internet
create lists on someone else's instance. At the same time, the dominant
deployment is a single self-hoster spinning up an instance for their own
one event, who wants a zero-config path with no admin UI to configure
before they can create their first list
([access & identity](../spec/access-identity.md)).

## Decision

We will make creation open with zero config until one list exists on the
instance, self-locking after that first list. Once locked, creation
requires a valid `CREATE_SECRET` value unless `ALLOW_OPEN_CREATION=true`.
`CREATE_SECRET` accepts one or more comma-separated values, each an
independent symmetric capability token generated via `TokenGenerator`
(not an admin-chosen passphrase) and checked with constant-time
comparison ([ops](../spec/ops.md)).

## Alternatives considered

- **A single shared secret only** — rejected: insufficiently revocable
  per-invitee — revoking one person's access would mean rotating the
  secret for everyone else who holds it too.
- **An email allow-list with verification** — rejected: reintroduces an
  identity/authorization registry, contradicting the no-accounts
  principle; forces a hard SMTP dependency onto the core onboarding path,
  which is currently best-effort only; and requires either a redeploy per
  edit or a DB-backed admin UI with its own auth just to manage the list.

## Consequences

- The dominant solo/one-event deployment gets a frictionless zero-config
  path for its first list, while an internet-reachable instance is
  protected from unlimited anonymous list creation after that.
- Revoking one invitee is a config edit (remove their value from
  `CREATE_SECRET`) and a restart; other invitees' values are unaffected
  ([ops](../spec/ops.md)).
- Creation-gating does not depend on SMTP being configured — email
  delivery reliability is not on the critical path for onboarding
  ([ops](../spec/ops.md)).
- The homepage must state plainly when creation is currently locked
  rather than hiding the "Create a list" affordance ambiguously
  ([access & identity](../spec/access-identity.md)).
