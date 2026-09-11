# 0048. Guest sessions capped at N concurrent active holds per list

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Guest sessions capped at N concurrent active holds across a list, with an owner-side hold-release control as the reversal path; framed as blast-radius limiting, not access control

## Detail

**ADR-048 detail:** §[3.21](../../gubbins-spec.md#321-threat-model) names a malicious or curious co-guest with a valid key
as an actor, but every rate limit in the spec sat on a credential-proving route,
leaving post-authentication writes unbounded. The concrete denial path is
hold-hoarding: holding every quantity-1 item makes the list read as fully
claimed for up to `2 × HOLD_DURATION_DAYS` (six days at the default of 3, being
the initial hold plus one self-service extension),
with expiry computed lazily so nothing sweeps it and — until this ADR — no
owner-side release control to recover. A per-session write throttle was also
considered and **rejected**: it does not stop slow-drip hoarding (one hold an
hour still locks a twenty-item list within a day), so the semantic cap does the
work the temporal one would not, and adding both would mean a second
false-positive surface for no additional coverage. The cap is deliberately set
well above honest use; it is a ceiling on absurdity, not a quota. Its limit is
stated plainly rather than hidden: a session identifier is not an identity,
clearing cookies produces a new one, and falling back to IP would reintroduce
the venue-wifi false-positive problem already flagged in ADR-[042](./0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md) — more acutely
here, since at a physical event many honest guests share one IP *and*
legitimately write. The mechanism is therefore documented as a blast-radius
limiter over a control, with reversal (void, release, key rotation) remaining
the actual answer.
