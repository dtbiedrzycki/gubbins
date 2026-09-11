# Group gifts & funds


- Contributions go **to the owner**, who buys the item. No peer-to-peer money movement, no designated buyer.
- Group gift = a fund with a target and item metadata attached
- No holds on group or fund items
- **Overfunding** governed by `allowOverfunding`; excess stays on the same item, rendered as e.g. "$520 of $450 · 116%"
- Suggested amounts computed from the remainder — ¼, ⅓, ½, and **"cover the rest"**
- Underfunding at the event date breaks nothing; owner UI states it plainly without implying refunds
- **Contribution amounts are bounded two ways, for two different reasons.**
  The **money bound** is `targetMinor × MAX_CONTRIBUTION_TARGET_MULTIPLE`
  (default 5), applying where the item has a target. It is currency-neutral
  by construction, since it derives from a number the owner entered in their
  own currency. The **arithmetic bound** is `MAX_CONTRIBUTION_MINOR`, a fixed
  constant (10^12 minor units) that exists solely to keep sums inside safe
  integer range — it is not a statement about how much money is reasonable,
  and is set far above any honest gift in any currency. Both are input
  validation, **not** overfunding policy: `allowOverfunding: allow` bypasses
  neither. *(ADR-[049](../adr/0049-contribution-amounts-bounded-by-absolute-and-target.md), amended by ADR-[063](../adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md))*
- **Fat-finger protection is a client-side confirmation, not a hard block.**
  Where an amount is disproportionate to the target or to the list's other
  amounts, the contribute flow asks the guest to confirm before submitting.
  A pledge moves no money and is reversible by the owner in one click
  (§[3.6](manual-contributions.md)), so prevention at the point of entry is the proportionate control;
  a configured server-side money threshold was tried and removed as
  answering an unanswerable question — "how much money is too much" has no
  currency-independent answer. *(ADR-[063](../adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md))*
- Manual contributions (§[3.6](manual-contributions.md)) warn rather than block above the ceiling —
  the owner is the authoritative party and may legitimately be recording
  an unusually large offline gift.
- Policy check lives in the domain: `canAccept(amount, now, policy)`, which
  enforces the sanity ceiling alongside the overfunding policy


---

[← Back to spec index](README.md)
