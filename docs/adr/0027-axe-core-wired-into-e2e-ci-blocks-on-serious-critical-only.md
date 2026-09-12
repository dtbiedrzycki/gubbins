# 0027. axe-core wired into e2e; CI blocks on serious/critical only

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The project's accessibility target ([accessibility & browser
support](../spec/accessibility-and-browser-support.md)) needs ongoing
verification, but this is a small self-hosted OSS project without a
dedicated accessibility reviewer. Automated scanners like `axe` are
widely cited as catching only roughly 30–50% of real WCAG issues — they
can't verify that a live region announces correctly in an actual screen
reader, or that tab order is logically sane rather than merely present
in the DOM. A CI gate had to be chosen that would actually stay enabled
rather than get disabled in frustration, while still leaving a path to
real coverage beyond what automation alone finds.

## Decision

We will wire `@axe-core/playwright` into the existing e2e suite across
the key guest and owner pages, block CI only on serious/critical
violations (moderate/minor logged as warnings, not blocking), require a
manual keyboard-only pass and a manual screen-reader pass on the hold
and contribute flows before v1, and track "zero moderate violations" as
a concrete v1.0 release-checklist item rather than an open-ended ratchet.

## Alternatives considered

- **Blocking CI on any axe violation at any severity from day one** —
  rejected: impractical for a small self-hosted OSS project without a
  dedicated accessibility reviewer; risks either blocking unrelated PRs
  on pre-existing minor issues or getting the check disabled entirely in
  frustration.
- **Treating axe as sufficient on its own, with no manual pass** —
  rejected: automated tools are widely cited as catching only roughly
  30–50% of real WCAG issues, since they can't verify a live region
  actually announces correctly in a screen reader or that tab order is
  logically sane rather than merely present in the DOM.
- **Leaving the moderate/minor ratchet open-ended ("tighten over
  time")** — rejected: an unanchored ratchet tends to accumulate
  permanent debt instead of actually tightening, in favor of a concrete
  checkpoint instead.

## Consequences

- CI stays useful rather than becoming a source of blocked, unrelated
  PRs, at the cost of moderate/minor violations persisting until the
  v1.0 checkpoint.
- A manual keyboard-only pass and a manual screen-reader pass on the
  hold and contribute flows — the two commitment-critical paths — are
  required before v1, not merely recommended.
- "Zero moderate violations" is a tracked v1.0 release-checklist item
  (a Forgejo issue), giving the ratchet an actual endpoint instead of an
  indefinite intention.
