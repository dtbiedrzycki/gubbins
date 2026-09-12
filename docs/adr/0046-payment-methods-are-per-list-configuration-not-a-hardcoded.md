# 0046. Payment methods are per-list configuration, not a hardcoded enum

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The spec hardcoded Zelle and Venmo, both US-only rails, while `currency`
was already per-list and freely configurable — an internal contradiction
present in v0.9, not a hypothetical future gap: a EUR list rendered a
Venmo button. ADR-[004](./0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md)
establishes that no payment is ever verified programmatically, so a payment
method carries no integration weight; it is three pieces of display data
(label, handle, render strategy). Encoding two US providers as a domain
enum therefore bought nothing and cost generality. The same reasoning has
already been accepted twice elsewhere in this cluster of decisions, where
the browser matrix was widened and an ICU-compatible strings module was
adopted specifically because multilingual, international family guest
lists are a plausible near-term case for this project rather than a
speculative one. The retrofit cost is also asymmetric: a value object now
versus a domain change plus a migration over live contribution rows later.

## Decision

We will model payment methods as per-list configuration (label + handle +
render strategy), not a hardcoded Zelle/Venmo enum. v1 ships venmo, zelle,
and custom, with further providers as community-contributable data files.
`custom` is text/QR only, and owner-supplied strings are never rendered as
links.

## Alternatives considered

- **Keep the enum and treat international rails as future work** —
  rejected on the same reasoning already accepted twice in this cluster of
  decisions: international, multilingual guest lists are a near-term case
  for this project, not a speculative one, and the later retrofit cost
  (domain change plus migration over live contribution rows) is worse than
  modeling it as data now.

## Consequences

- The provider catalogue is deliberately kept thin at v1 (venmo, zelle,
  custom) — the generality is in the model, not in speculatively
  implementing a dozen payment rails; new providers can be added as data
  files without a domain or migration change.
- `custom`'s text-and-QR-only restriction closes a `javascript:`-URI XSS
  path that would otherwise be opened against the app's own origin by
  owner-supplied input.
- Because no payment method carries integration weight
  (ADR-[004](./0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md)),
  adding a provider is purely a data/rendering concern, not a verification
  concern.
