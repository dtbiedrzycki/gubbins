# 0063. Currency validation, minor-unit storage, and the ceiling reframe

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Currency is a validated ISO 4217 code, immutable once priced items exist; amounts stay integer minor units with major-unit conversion confined to presentation. The absolute contribution ceiling is reframed as a fixed arithmetic guard, since a money threshold in minor units means a different amount on every list and no currency-independent answer to "how much is too much" exists

## Detail

**ADR-063 detail:** Two gaps surfaced while auditing the contribution
ceiling. First, `currency` had no validation rule anywhere in the
document, while `timezone` — added later by ADR-[051](./0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md) — carries an explicit
one. The asymmetry was age, not intent: newer decisions got rigorous
treatment and older asserted fields never went back for it. Second, the
minor-unit storage rule existed as a single unexplained bullet in §[3.5](../spec/payments.md),
despite being as load-bearing as the timezone model and carrying less
written rationale than the choice of QR library.

On storage: integer minor units are kept. SQLite has no true decimal type
— a `DECIMAL(10,2)` column declaration takes NUMERIC affinity and lands
as INTEGER or REAL regardless — so "store the decimal" means storing an
IEEE 754 double, and non-associative float addition would make §[3.13](../spec/testing.md)'s
projection-rebuild comparison flaky by construction and its
export/round-trip equivalence check unreliable. Decimal-as-TEXT with a
library was rejected because projections are real SQL tables that must
`SUM()` and compare natively, and because it adds a runtime dependency
against §[3.20](../spec/governance-licensing-and-release.md)'s budget. Whole units (no sub-unit precision at all) were
also considered: they would misrepresent the `.99` retail pricing that
dominates the scraped/bulk-add path (§[3.14](../spec/owner-dashboard.md)), make a `targetMinor` ending
in cents unreachable under `allowOverfunding: block`, and remove the
exponent that the old ceiling was inadvertently relying on. Nothing here
needs a rounding policy — one currency per list (ADR-[006](./0006-single-currency-per-list.md)), no conversion,
addition and comparison only, and the sole division (the ¼/⅓/½
suggestions) is client-side and never written to the server (§[3.15](../spec/guest-ux.md)).

On validation: ISO 4217 alpha-3, checked against
`Intl.supportedValuesOf('currency')` at write time. This is also what
excludes cryptocurrency — `Intl.NumberFormat` has no exponent for BTC, so
display breaks however the value is stored, and every shipped payment
rail (venmo, zelle, custom) is fiat. Immutability once a priced item
exists follows ADR-[013](./0013-item-type-immutable-after-first-claim.md)'s reasoning: reinterpreting stored amounts in
place is silent corruption, and the alternative — converting — needs FX
rates that the no-outbound-requests principle forbids.

On the ceiling: the absolute bound stops claiming to mean an amount of
money. A pledge is a guest's unverifiable self-assertion (ADR-[004](./0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md)); it
moves nothing, renders hatched pending confirmation, and the owner voids
it in one click. The failure it guards against is a distorted progress
bar until reversal, not a financial loss — a materially smaller harm than
the hold cap's six-day item lockout with no owner recourse (ADR-[048](./0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)),
which is why that one earned a tuned threshold and this one does not.
Set as a fixed arithmetic guard, it is currency-independent because it is
no longer about currency. The fat-finger case ADR-[049](./0049-contribution-amounts-bounded-by-absolute-and-target.md) also cited moves to
a client-side confirmation, which catches the error where it happens and
needs no configured number. The cost is accepted honestly: a hostile
guest with a valid key can pledge a large representable amount and the
owner must void it — consistent with §[3.21](../spec/threat-model-summary.md)'s existing stance that
detection-and-reversal, not prevention, is the answer to a keyed guest.
