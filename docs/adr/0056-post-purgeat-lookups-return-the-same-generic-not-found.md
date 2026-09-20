# 0056. Post-purgeAt lookups return the same generic not-found response

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Post-`purgeAt` lookups return the same generic not-found response as a never-existed slug, softened with an unconditional, non-distinguishing hint that links can expire — not a distinguishable tombstone state, to avoid reopening the enumeration guard ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md) established

## Detail

**ADR-056 detail:** A distinguishable "this list has ended" response for
recently-purged slugs was considered, since it's a better experience than
a bare not-found for a guest who bookmarked the list or an owner who lost
track of `purgeAt`. Rejected because it reopens exactly what ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md)
closed: if "purged" is a distinguishable outcome from "never existed,"
anyone probing a slug learns whether it was ever real, which is a genuine
(if narrow) enumeration leak — and ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md) was written as a blanket rule
specifically to avoid special-casing individual failure modes. The
generic response instead gains a second, unconditional sentence about
lists expiring in general, present on every failure regardless of cause,
so it carries no per-slug signal. This is a partial answer, not a full
one — a guest genuinely can't tell "I mistyped this" from "this expired"
from the response alone — but that ambiguity is the accepted cost of
keeping ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md) a hard rule rather than a rule with an exception.
