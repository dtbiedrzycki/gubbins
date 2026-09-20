# 0034. Threat model documented in docs/threat-model.md

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The spec accumulates security-relevant decisions (constant-time
comparison, cookie transport, rate limiting, and others) piecemeal across
many ADRs and spec sections, with no single place that enumerates the
system's assets, actors, and threats and maps each one to its mitigation.
Without that enumeration it's hard to tell whether a given threat class
has been considered at all, versus addressed implicitly by some other
decision.

## Decision

We will document the full threat model — assets, actors, and a
threat-by-threat enumeration — in `docs/threat-model.md`, with each
identified threat class mapped to an existing spec mitigation. A summary
of this mapping is kept in the [threat model](../spec/threat-model-summary.md)
spec topic as the authoritative day-to-day reference, with the full
document as the source of record.

## Alternatives considered

- **No dedicated threat model; rely on per-ADR security reasoning** —
  rejected: leaves no single place to check that every threat class has a
  mapped mitigation, and makes gaps (like the one closed by
  ADR-[035](./0035-constant-time-comparison-generalized-to-all-secret.md))
  harder to spot before they're found by drafting exercises.

## Consequences

- Every threat class identified going forward needs an entry mapping it
  to a mitigation; an unmapped threat is a visible gap rather than a
  silent one.
- Drafting the threat model surfaces documentation gaps in the existing
  spec (see ADR-[035](./0035-constant-time-comparison-generalized-to-all-secret.md),
  found this way) even when no new behavior is needed.
- The full document lives in `docs/threat-model.md`, kept in sync with
  the [threat model](../spec/threat-model-summary.md) spec-topic summary
  as mitigations are added or changed.
