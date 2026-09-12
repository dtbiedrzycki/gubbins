# 0053. Owner-token recovery deferred; direct operator access is the path

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

An operator CLI and a self-service email flow were both designed for
owner-token recovery. On review, the dominant deployment shape (solo
self-hoster, operator = owner) needs neither, and the "hosting for a
friend" case they'd serve is already addressable today via direct
operator container/DB access — the same trust boundary the
[threat model](../spec/threat-model-summary.md) already assumes for the
operator.

## Decision

We will defer owner-token recovery tooling; the current recovery path is
direct operator access, consistent with the operator's existing
trusted-actor status in the threat model. This is a deferral, not a
rejection — if a dedicated recovery flow ships later, it ships as its
own decision.

## Alternatives considered

- **An operator CLI for owner-token recovery** — rejected: building
  dedicated tooling now is complexity ahead of demonstrated need (YAGNI,
  consistent with ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md),
  ADR-[034](./0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md)),
  when direct operator access already covers the case.
- **A self-service email recovery flow** — rejected for the same reason:
  the "hosting for a friend" case it would serve is already addressable
  via the operator's existing trusted-actor access.

## Consequences

- The owner-email field that [access & identity](../spec/access-identity.md)
  originally collected in anticipation of this future automated flow has
  since been removed: the "hosting for a friend" case it was meant to
  serve is one where the operator already has the owner's address out of
  band, so the field's only claimed beneficiary never needed it, while it
  sat outside every PII mechanism the project built for guests
  (`GuestPii`, `piiRef`, ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)'s
  redaction, ADR-[060](./0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)'s
  self-service, [observability](../spec/observability.md)'s redact paths
  — all guest-scoped). Collecting data against an unbuilt feature is the
  half-built version of the thing this ADR deferred.
- If the deferred flow ships, the owner-email field ships with it.
