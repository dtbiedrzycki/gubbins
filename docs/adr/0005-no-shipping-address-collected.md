# 0005. No shipping address collected

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Gift lists could plausibly want a shipping address for guests buying
items to be delivered. Collecting one adds a stored PII field with real
sensitivity (a home address) that isn't collected anywhere else in the
system, at odds with the privacy-minimizing design of a tool aimed at
casual, mostly-anonymous participants ([privacy](../spec/privacy.md)).

## Decision

We will not collect a shipping address anywhere in the app; an owner who
wants to share one may place it in the list description as free text.

## Alternatives considered

- **A dedicated, structured shipping-address field on the list or item**
  — rejected: adds a sensitive stored PII field with no use the app
  itself needs, when a list description can carry the same information
  without dedicated storage or validation.

## Consequences

- No shipping-address PII is stored, so it's excluded entirely from the
  app's privacy surface and purge/erasure logic
  ([privacy](../spec/privacy.md)) rather than needing to be redacted or
  purged.
- Any address handling is free-text and owner-authored, with no
  formatting, validation, or geographic support required.
