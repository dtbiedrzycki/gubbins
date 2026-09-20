# 0024. WCAG 2.2 Level AA is the accessibility target

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

WCAG 2.2 Level AA is the accessibility target across guest and owner UI (upgraded from an initial 2.1 target — 2.2's SC 2.5.7 directly covers the drag-to-reorder keyboard alternative); AAA not targeted

## Detail

**ADR-024 detail:** Initially set to WCAG 2.1 AA. Revised to 2.2 AA after review: WCAG 2.2 (current since Oct 2023) adds SC 2.5.7 (Dragging Movements), which requires exactly the keyboard alternative to drag-and-drop already specified for the reorder feature — targeting the older standard when the current one has a criterion directly on point for a feature this spec already includes was an unforced weak choice. AAA remains out of scope: its requirements (e.g., 7:1 contrast ratios, stricter timing rules) are rarely achievable without materially constraining visual design, and no external standard (ADA case law, Section 508, EN 301 549) references AAA as an expectation.
