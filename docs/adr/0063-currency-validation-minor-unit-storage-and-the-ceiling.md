# 0063. Currency validation, minor-unit storage, and the ceiling reframe

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Two gaps surfaced while auditing the contribution ceiling
(ADR-[049](./0049-contribution-amounts-bounded-by-absolute-and-target.md)).
First, `currency` had no validation rule anywhere in the spec, while
`timezone` — added later by
ADR-[051](./0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md)
— carries an explicit one; the asymmetry was age, not intent, since
newer decisions got rigorous treatment and older asserted fields never
went back for it. Second, the minor-unit storage rule existed as a
single unexplained bullet in [payments](../spec/payments.md), despite
being as load-bearing as the timezone model and carrying less written
rationale than the choice of QR library. Auditing both together also
exposed that ADR-049's absolute ceiling, expressed in minor units,
denominates differently across currencies and has no
currency-independent meaning.

## Decision

We will validate `currency` as an ISO 4217 alpha-3 code, checked against
`Intl.supportedValuesOf('currency')` at write time, and make it
immutable once priced items exist. Amounts stay integer minor units,
with major-unit conversion confined to presentation. This narrows
ADR-[049](./0049-contribution-amounts-bounded-by-absolute-and-target.md)'s
absolute contribution ceiling only: it is reframed as a fixed
arithmetic guard rather than a currency-denominated bound, since a money
threshold in minor units means a different amount on every list and no
currency-independent answer to "how much is too much" exists.

## Alternatives considered

- **A `DECIMAL`/`NUMERIC` storage column** — rejected: SQLite has no
  true decimal type — a `DECIMAL(10,2)` column declaration takes
  NUMERIC affinity and lands as INTEGER or REAL regardless — so "store
  the decimal" means storing an IEEE 754 double, and non-associative
  float addition would make [testing](../spec/testing.md)'s
  projection-rebuild comparison flaky by construction and its
  export/round-trip equivalence check unreliable.
- **Decimal-as-TEXT with a library** — rejected: projections are real
  SQL tables that must `SUM()` and compare natively, and it adds a
  runtime dependency against
  [governance, licensing & release](../spec/governance-licensing-and-release.md)'s
  budget.
- **Whole units, no sub-unit precision at all** — rejected: it would
  misrepresent the `.99` retail pricing that dominates the
  scraped/bulk-add path ([owner dashboard](../spec/owner-dashboard.md)),
  make a `targetMinor` ending in cents unreachable under
  `allowOverfunding: block`, and remove the exponent the old ceiling was
  inadvertently relying on.
- **Allow currency conversion instead of immutability once priced items
  exist** — rejected, following
  ADR-[013](./0013-item-type-immutable-after-first-claim.md)'s
  reasoning: reinterpreting stored amounts in place is silent
  corruption, and conversion needs FX rates that the no-outbound-requests
  principle forbids.
- **Keep the absolute ceiling as a tuned, currency-denominated
  threshold**, like the hold cap
  (ADR-[048](./0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md))
  — rejected: a pledge is a guest's unverifiable self-assertion
  (ADR-[004](./0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md));
  it moves nothing, renders hatched pending confirmation, and the owner
  voids it in one click. The failure it guards against is a distorted
  progress bar until reversal, not a financial loss — a materially
  smaller harm than the hold cap's six-day item lockout with no owner
  recourse, which is why that one earned a tuned threshold and this one
  does not.

## Consequences

- No rounding policy is needed: one currency per list
  (ADR-[006](./0006-single-currency-per-list.md)), no conversion,
  addition and comparison only, and the sole division (the ¼/⅓/½
  suggestions) is client-side and never written to the server
  ([guest UX](../spec/guest-ux.md)).
- Validating against `Intl.supportedValuesOf('currency')` also excludes
  cryptocurrency: `Intl.NumberFormat` has no exponent for BTC, so
  display breaks however the value is stored, and every shipped payment
  rail (venmo, zelle, custom) is fiat.
- The fat-finger case ADR-049 also cited moves to a client-side
  confirmation, which catches the error where it happens and needs no
  configured number.
- This revision touches only the absolute figure's derivation. The
  target-relative bound, its independence from `allowOverfunding`, and
  ADR-049's reasoning that a permissive overfunding stance must not
  disable a sanity check are unaffected and still govern that decision.
- The accepted cost: a hostile guest with a valid key can pledge a
  large representable amount and the owner must void it — consistent
  with [threat model summary](../spec/threat-model-summary.md)'s
  existing stance that detection-and-reversal, not prevention, is the
  answer to a keyed guest.
