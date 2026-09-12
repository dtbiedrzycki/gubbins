# 0048. Guest sessions capped at N concurrent active holds per list

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The [threat model](../spec/threat-model-summary.md) names a malicious or
curious co-guest with a valid key as an actor, but every rate limit in the
spec sat on a credential-proving route, leaving post-authentication writes
unbounded. The concrete denial path is hold-hoarding: holding every
quantity-1 item makes the list read as fully claimed for up to
`2 × HOLD_DURATION_DAYS` (six days at the default of 3, being the initial
hold plus one self-service extension), with expiry computed lazily so
nothing sweeps it and — until this ADR — no owner-side release control to
recover.

## Decision

We will cap guest sessions at N concurrent active holds across a list, set
well above honest use as a ceiling on absurdity rather than a quota, and
add an owner-side hold-release control as the reversal path. This is framed
as blast-radius limiting, not access control: a session identifier is not
an identity, and clearing cookies produces a new one.

## Alternatives considered

- **Per-session write throttle** — rejected: it does not stop slow-drip
  hoarding (one hold an hour still locks a twenty-item list within a day),
  so the semantic cap does the work a temporal one would not, and adding
  both would mean a second false-positive surface for no additional
  coverage.
- **Fall back to IP-based limiting** — rejected: it would reintroduce the
  venue-wifi false-positive problem already flagged in
  ADR-[042](./0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md),
  more acutely here, since at a physical event many honest guests share one
  IP *and* legitimately write.

## Consequences

- The cap does not stop a determined actor who clears cookies — its stated
  limit is a session-scoped blast-radius control, not an identity control,
  and reversal (void, release, key rotation) remains the actual answer to
  a determined hoarder.
- Owners gain a hold-release control that previously did not exist,
  closing the recovery gap that made hoarding effective for up to
  `2 × HOLD_DURATION_DAYS`.
- Honest guests are essentially unaffected, since the cap is set well
  above normal usage.
