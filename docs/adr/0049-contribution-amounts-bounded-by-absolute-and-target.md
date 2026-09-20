# 0049. Contribution amounts bounded by absolute and target-relative ceilings

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Contribution amounts bounded by an absolute and a target-relative sanity ceiling, enforced in `canAccept` independently of `allowOverfunding` *(the absolute bound was reframed by ADR-[063](./0063-currency-validation-minor-unit-storage-and-the-ceiling.md) as an arithmetic guard rather than a money threshold, and the fat-finger case moved to a client-side confirmation; the target-relative bound and the independence from `allowOverfunding` stand)*

## Detail

**ADR-049 detail:** The spec bounded contribution amounts only by the
overfunding policy, which under `allow` is no bound at all. A single mistyped or
hostile amount would not overflow a SQLite integer but would destroy the
progress bar's usefulness and the reconciliation totals. The ceiling is
deliberately placed outside the overfunding policy rather than inside it:
overfunding is a product decision about whether guests may exceed a target, and
the project's stated stance there is permissive; this is input validation
against a nonsense value, and the two should not be conflated such that a
permissive product choice disables a sanity check. Manual entries warn rather
than block, since the owner is the authoritative party recording a real-world
fact.

Amended by ADR-[063](./0063-currency-validation-minor-unit-storage-and-the-ceiling.md) on the absolute bound only. `MAX_CONTRIBUTION_MINOR`
was set at 1,000,000 minor units and glossed as "e.g. $10,000," but a
minor-unit threshold denominates differently on every list — the same
constant is ¥1,000,000 on a JPY list and 1,000 KWD on a Kuwaiti one, a
roughly threefold real-terms spread. Attempts to correct this were worse:
restating the default in major units produces a ~490× spread and would
block ordinary gifts on a JPY list, because a currency's decimal places
track its unit value and a flat minor-unit figure crudely self-corrects
for that. Rather than build a per-currency default table to launder an
accidental property into a designed one, ADR-[063](./0063-currency-validation-minor-unit-storage-and-the-ceiling.md) removes the money
meaning from the constant entirely. The reasoning in the paragraph above
— that a permissive overfunding stance must not disable a sanity check —
is unaffected and still governs the target-relative bound.
