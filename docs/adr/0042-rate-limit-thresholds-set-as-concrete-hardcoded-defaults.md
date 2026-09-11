# 0042. Rate-limit thresholds set as concrete hardcoded defaults

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Rate-limit thresholds set as concrete hardcoded defaults from the start (see §[3.21](../../gubbins-spec.md#321-threat-model) table), stored in SQLite with no new service dependency; flagged for empirical re-tuning pre-v1 given realistic false positives from guests sharing venue wifi

## Detail

**ADR-042 detail:** Rate-limit thresholds were previously stated qualitatively ("rate limit... with global lockout") with no concrete numbers, which isn't implementable or testable as written. Concrete defaults were set (§[3.21](../../gubbins-spec.md#321-threat-model) table) rather than left to be figured out during implementation, consistent with the project's general preference for stated defaults over ambiguity. The numbers are acknowledged as reasonable starting estimates rather than empirically derived: the specific risk flagged is guests at a physical event sharing a single venue-wifi IP address, which could cause legitimate guests to trip a per-IP threshold intended for a single attacker. A dedicated pre-v1 load/behavior test (§[3.13](../../gubbins-spec.md#313-testing)) is required to validate or adjust the per-IP numbers before they ship as final; the per-slug aggregate threshold is a separate, deliberately softer control (delay, not lockout) precisely to avoid one hostile actor locking out an entire guest list.

ADR-[068](./0068-client-ip-resolution-is-a-hop-count.md) later found the false-positive concern recorded here had a
strictly worse sibling this test would not have caught. Venue wifi puts
many guests behind one NAT address; a misconfigured proxy puts *every*
guest behind one address on every deployment, permanently; and shared VPN
egress puts unrelated, dispersed guests in one bucket. The first and third
are tuning questions this ADR's pre-v1 test still owns; the second was a
mechanism defect in address resolution, fixed by replacing the
`TRUST_PROXY` boolean with a hop count.
