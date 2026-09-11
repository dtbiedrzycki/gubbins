# 0014. List creation self-locks; gated by CREATE_SECRET thereafter

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

List creation self-locks after the first list; gated by multi-value `CREATE_SECRET` thereafter unless `ALLOW_OPEN_CREATION`

## Detail

**ADR-014 detail:** Creation is open with zero config until one list exists on the instance. After that, creation requires a valid `CREATE_SECRET` value unless `ALLOW_OPEN_CREATION=true`. `CREATE_SECRET` accepts one or more comma-separated values, each an independent symmetric capability token generated via `TokenGenerator` (not an admin-chosen passphrase) and checked with constant-time comparison. Rejected alternatives: (a) a single shared secret only — insufficiently revocable per-invitee; (b) an email allow-list with verification — rejected because it reintroduces an identity/authorization registry (contradicts the no-accounts principle), forces a hard SMTP dependency onto the core onboarding path (currently best-effort only), and requires either a redeploy per edit or a DB-backed admin UI with its own auth to manage.
