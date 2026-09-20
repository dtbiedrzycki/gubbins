# 0027. axe-core wired into e2e; CI blocks on serious/critical only

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

`@axe-core/playwright` wired into the existing e2e suite across key guest and owner pages; CI blocks on serious/critical violations only, moderate/minor logged; a manual keyboard + screen-reader pass on the hold/contribute flows is required pre-v1, and "zero moderate violations" is a tracked v1.0 release-checklist item, not an open-ended ratchet

## Detail

**ADR-027 detail:** Rejected alternative: blocking CI on any axe violation at any severity from day one. Rejected as impractical for a small self-hosted OSS project without a dedicated accessibility reviewer — it risks either blocking unrelated PRs on pre-existing minor issues or getting disabled entirely in frustration. However, axe alone was judged insufficient as the *only* gate: automated tools are widely cited as catching roughly 30–50% of real WCAG issues, since they can't verify a live region announces correctly in an actual screen reader or that tab order is logically sane rather than merely present in the DOM. A manual keyboard-only pass and a manual screen-reader pass on the hold and contribute flows — the two commitment-critical paths — are therefore required before v1, not merely recommended. The "moderate/minor logged, tightened over time" ratchet was also given a concrete checkpoint (zero moderate violations required before v1.0, tracked as a Forgejo issue) rather than left as an open-ended intention, since an unanchored ratchet tends to accumulate permanent debt instead of actually tightening.
