# 0082. Payment handles are set at list creation and edited with the list details

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** dtbiedrzycki
- **Amended:** 2026-11-26. Handles are editable with the list details, and clearing both is refused while the list has a group gift. They are stored as owner PII (ADR-[090](./0090-owner-payment-handles-are-owner-pii-in-a-side-table.md)).

## Context

ADR-[044](./0044-payment-methods-are-per-list-configuration-not-a-hardcoded.md)
models payment methods as per-list configuration with several kinds. The
launch cut needs group gifts to work but not a settings UI.

## Decision

Venmo and Zelle handles are set at list creation and edited with the list
details, in the form the owner already uses for title, description and theme.
A list with a group gift needs at least one: adding a group gift to a list
with neither, or clearing both while the list has a group gift, is refused
with the same `NoPaymentMethodError`. This narrows ADR-044 to two kinds and
defers a separate settings UI and the `custom` kind.

## Alternatives considered

- **Env vars** — rejected: payment details belong with the list.
- **A payment-settings UI** — deferred: two fields on the list-details
  edit meet the need.

## Consequences

- A typo or a changed account is fixed from the manage page.
- Each pledge records the handle the guest paid, so an edit doesn't rewrite
  where earlier pledges were sent (ADR-[045](./0045-contribution-snapshots-its-payment-method-at-pledge-time.md)).
