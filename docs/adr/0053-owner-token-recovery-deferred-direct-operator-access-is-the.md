# 0053. Owner-token recovery deferred; direct operator access is the path

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Owner-token recovery (operator CLI, self-service email) deferred; current recovery path is direct operator container/DB access, consistent with the operator's existing trusted-actor status in the threat model; the owner-email field originally collected against that future flow was subsequently removed as collection without a purpose

## Detail

**ADR-053 detail:** An operator CLI and a self-service email flow were both
designed for owner-token recovery, but on review the dominant deployment shape
(solo self-hoster, operator = owner) needs neither, and the "hosting for a
friend" case they'd serve is already addressable today via direct operator
access — the same trust boundary the threat model (§[3.21](../../gubbins-spec.md#321-threat-model)) already assumes for
the operator. Building dedicated tooling now is complexity ahead of
demonstrated need (YAGNI, consistent with ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md), ADR-[034](./0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md)).

Deferred, not rejected. The owner-email field that §[3.1](../../gubbins-spec.md#31-access--identity) originally
collected in anticipation of a future automated flow has been removed:
the "hosting for a friend" case it was meant to serve is one where the
operator already has the owner's address out of band, so the field's only
claimed beneficiary never needed it, while it sat outside every PII
mechanism the project built for guests (`GuestPii`, `piiRef`, ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)'s
redaction, ADR-[060](./0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)'s self-service, §[3.19](../../gubbins-spec.md#319-observability-logging-metrics-tracing)'s redact paths — all
guest-scoped). Collecting data against an unbuilt feature is the
half-built version of the thing this ADR deferred. If the flow ships, the
field ships with it.
