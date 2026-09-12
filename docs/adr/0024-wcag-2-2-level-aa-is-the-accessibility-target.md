# 0024. WCAG 2.2 Level AA is the accessibility target

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The spec needs an explicit accessibility conformance target for both
guest and owner UI ([accessibility & browser support](../spec/accessibility-and-browser-support.md)). The target was
initially set to WCAG 2.1 AA, then revisited once the reorder feature's
drag-and-drop keyboard alternative was specified.

## Decision

We will target WCAG 2.2 Level AA across guest and owner UI; AAA is not
targeted.

## Alternatives considered

- **WCAG 2.1 AA** (the original target) — rejected: WCAG 2.2 (current
  since October 2023) adds SC 2.5.7 (Dragging Movements), which requires
  exactly the keyboard alternative to drag-and-drop this spec already
  specifies for the reorder feature. Targeting the older standard when
  the current one has a criterion directly on point for a feature already
  in scope was an unforced weak choice.
- **AAA** — rejected: its requirements (e.g. 7:1 contrast ratios, stricter
  timing rules) are rarely achievable without materially constraining
  visual design, and no external standard this project cares about (ADA
  case law, Section 508, EN 301 549) references AAA as an expectation.

## Consequences

- SC 2.5.7 becomes a hard requirement: drag-to-reorder must ship with a
  keyboard-operable alternative, not just a visual affordance
  (ADR-[025](./0025-hold-sheet-and-contribute-flow-use-native-dialog.md)).
- AA is the ceiling for design tradeoffs — contrast, timing, and similar
  decisions are evaluated against AA, not stretched toward AAA.
