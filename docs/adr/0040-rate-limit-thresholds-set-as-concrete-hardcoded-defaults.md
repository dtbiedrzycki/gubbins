# 0040. Rate-limit thresholds set as concrete hardcoded defaults

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Rate-limit thresholds were previously stated only qualitatively ("rate
limit... with global lockout") with no concrete numbers, which isn't
implementable or testable as written. The project generally prefers
stated defaults over ambiguity left to be figured out during
implementation.

## Decision

We will set concrete, hardcoded rate-limit default thresholds from the
start (see the [rate-limit thresholds](../spec/threat-model-summary.md)
table), stored in SQLite with no new service dependency, flagged for
empirical re-tuning before v1.

## Alternatives considered

- **Leave thresholds qualitative, tune during implementation** —
  rejected: not implementable or testable as written, and inconsistent
  with the project's preference for stated defaults over ambiguity.
- **Introduce a dedicated rate-limiting service/dependency** — rejected:
  thresholds are tracked in SQLite instead, avoiding a new service
  dependency for a need the existing store can meet.

## Consequences

- The numbers are reasonable starting estimates, not empirically derived
  — a dedicated pre-v1 [load/behavior test](../spec/testing.md) is
  required to validate or adjust the per-IP thresholds before they ship
  as final.
- The specific risk flagged and not yet resolved by this decision: guests
  at a physical event sharing a single venue-wifi IP address could trip a
  per-IP threshold intended for a single attacker. This remains an open
  concern for the pre-v1 test to tune, not something this ADR resolves.
- ADR-[066](./0066-client-ip-resolution-is-a-hop-count.md) later
  identifies related scenarios that put multiple, unrelated guests behind
  one apparent address: a misconfigured proxy puts *every* guest behind
  one address on every deployment, permanently, and shared VPN egress
  puts unrelated, dispersed guests in one bucket. The venue-wifi and
  VPN-egress cases are tuning questions this ADR's pre-v1 test still
  owns; the misconfigured-proxy case is a distinct mechanism defect in
  address resolution, which ADR-066 fixes by replacing the `TRUST_PROXY`
  boolean with a hop count.
- The per-slug aggregate threshold is a separate, deliberately softer
  control (delay, not lockout), chosen specifically to avoid one hostile
  actor locking out an entire guest list.
