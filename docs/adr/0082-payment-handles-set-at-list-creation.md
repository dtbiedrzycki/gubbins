# 0082. Payment handles are set at list creation

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** dtbiedrzycki

## Context

ADR-[044](./0044-payment-methods-are-per-list-configuration-not-a-hardcoded.md)
models payment methods as per-list configuration with several kinds. The
launch cut needs group gifts to work but not a settings UI.

## Decision

Venmo and Zelle handles are set at list creation, stored on the wishlist and
can't be edited yet. A group gift can't be added to a list with neither. This
narrows ADR-044 to two kinds and defers the settings UI and the `custom` kind.

## Alternatives considered

- **Env vars** — rejected: payment details belong with the list.
- **A payment-settings UI** — deferred.

## Consequences

- A typo needs a DB fix until editing exists (accepted by the owner on
  2026-10-13).
