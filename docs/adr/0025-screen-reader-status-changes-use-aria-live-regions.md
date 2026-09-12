# 0025. Screen-reader status changes use ARIA live regions

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Status changes (a hold confirming, a contribution recording, a field
failing validation) need to reach screen-reader users, not just sighted
ones ([accessibility & browser support](../spec/accessibility-and-browser-support.md)). Visual-only toast/snackbar
components are invisible to screen-reader users unless wired to an ARIA
live region — a common accessibility gap.

## Decision

We will announce screen-reader status changes through ARIA live regions
— `polite` for success confirmations, `assertive` for field-level
validation errors — instead of visual-only toasts. Status badges pair an
icon and text label, never color alone.

## Alternatives considered

- **Visual-only toast/snackbar notifications** — rejected: invisible to
  screen-reader users unless explicitly wired to a live region, which a
  plain toast component isn't by default.
- **A single live-region politeness level for all status changes** —
  rejected: a success confirmation can wait for a natural pause in
  speech output, but a validation error blocking form submission needs
  to interrupt immediately so the user doesn't try to submit again into
  the same wall.
- **Color alone to distinguish status badges** — rejected: inaccessible
  to colorblind and low-vision users; pairing an icon with the text label
  costs little and closes the gap.

## Consequences

- Every success/error surface in the hold sheet and contribute flow
  (ADR-[024](./0024-hold-sheet-and-contribute-flow-use-native-dialog.md)) needs a live region wired up, not just visual styling —
  this is part of what the manual screen-reader pass before v1 checks
  ([accessibility & browser support](../spec/accessibility-and-browser-support.md)).
- `polite` vs. `assertive` becomes a per-message design decision, not a
  single global default — future status surfaces need to classify their
  own urgency rather than copy one pattern blindly.
