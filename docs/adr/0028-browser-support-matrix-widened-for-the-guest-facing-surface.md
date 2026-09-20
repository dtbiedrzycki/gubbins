# 0028. Browser support matrix widened for the guest-facing surface

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Browser support matrix widened to last 4 major versions (from last 2/current) for the guest-facing surface, given the older-device skew of a typical wedding/shower guest list; owner dashboard keeps last 2 versions; hold/contribute flows additionally required to degrade gracefully rather than fail outright below the version floor

## Detail

**ADR-028 detail:** Initially set to "last 2 versions of evergreen browsers, current iOS Safari/Chrome Android," following general web-app usage patterns. Revised after noting that a wedding/baby-shower guest list skews toward relatives on older, un-upgraded devices — including iPhones hardware-capped below the current iOS version, which caps their Safari version with it — making a generic evergreen-browser assumption a weaker fit for this project's actual audience than for a typical app. Widened to last 4 major versions for the guest-facing surface. The owner dashboard keeps the tighter last-2-versions target, since owners remain a small, self-selected group unlikely to be on legacy devices — the two surfaces reasonably have different matrices given their different audiences. Beyond the version floor, the hold and contribute flows are additionally required to degrade gracefully (remain functionally submittable, even if visually plainer) rather than hard-fail on an unsupported browser, since these are the money/commitment-critical paths where a silent failure has the highest cost.
