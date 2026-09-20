# 0046. Payment methods are per-list configuration, not a hardcoded enum

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Payment methods are per-list configuration (label + handle + render strategy), not a hardcoded Zelle/Venmo enum; v1 ships venmo/zelle/custom with further providers as community-contributable data files; `custom` is text/QR only and owner-supplied strings are never rendered as links

## Detail

**ADR-046 detail:** The spec hardcoded Zelle and Venmo, both US-only rails,
while `currency` was already per-list and freely configurable — an internal
contradiction present in v0.9, not a hypothetical future gap: a EUR list
rendered a Venmo button. Because ADR-[004](./0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md) establishes that no payment is ever
verified programmatically, a payment method carries no integration weight; it
is three pieces of display data (label, handle, render strategy). Encoding two
US providers as a domain enum therefore bought nothing and cost generality.
Rejected alternative: keep the enum and treat international rails as future
work — rejected on the same reasoning already accepted twice in Cluster D,
where the browser matrix was widened and an ICU-compatible strings module
adopted specifically because multilingual, international family guest lists
are a plausible near-term case for this project rather than a speculative one.
The retrofit cost is also asymmetric: a value object now versus a domain change
plus a migration over live contribution rows later. The provider catalogue is
deliberately kept thin at v1 (venmo, zelle, custom) — the generality is in the
model, not in speculatively implementing a dozen payment rails. `custom`'s
text-and-QR-only restriction closes a `javascript:`-URI XSS path that would
otherwise be opened against the app's own origin by owner-supplied input.
