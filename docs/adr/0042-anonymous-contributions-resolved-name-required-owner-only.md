# 0042. Anonymous contributions resolved: name required, owner-only

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Two load-bearing views depend on knowing who made a contribution: the
reconciliation view matches incoming Zelle/Venmo payments against
pledges by name, and the thank-you view has no attribution target
without one. At the same time, some givers don't want to be identified
*to other guests* — a shy relative, or someone making a small top-up
amount.

## Decision

We will require a name for every contribution, but show it only to the
owner — never to other guests — gated by the existing spoiler toggles.
There is no per-list toggle for guest-visible names.

## Alternatives considered

- **Full guest-visible anonymity** — rejected: breaks the reconciliation
  view, which matches incoming payments against pledges by name, and
  leaves the thank-you view with no attribution target.
- **Full owner-side anonymity (owner also doesn't see the name)** —
  rejected: breaks the same two views for the same reason — reconciliation
  and thank-you need a name to attribute to *someone*, even if not to
  other guests.

## Consequences

- The reconciliation and thank-you views both have a guaranteed
  attribution target at the time this decision was made.
- A later decision, ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)
  and ADR-[058](./0058-guest-self-service-data-access-erasure-via-guestdataaccess.md),
  permits redaction after creation: a name is still required at creation,
  but it may later be nulled by either the owner's or the guest's own
  erasure action. Visibility scope — owner-only, never shown to other
  guests — is unchanged by that later decision. The thank-you view must
  accordingly tolerate a missing attribution target where this ADR
  originally assumed one was guaranteed, since an erasure right outranks
  a bookkeeping convenience.
- "Name always required" should be read as "name required at creation,"
  matching the invariant in the [domain model](../spec/domain-model.md)
  topic.
