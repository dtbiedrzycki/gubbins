# 0024. Hold sheet and contribute flow use native <dialog>

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The accessibility target (ADR-[023](./0023-wcag-2-2-level-aa-is-the-accessibility-target.md)) requires every interactive control to
be keyboard-operable with correct focus management and screen-reader
semantics ([accessibility & browser support](../spec/accessibility-and-browser-support.md)). Keyboard operability, focus, and
correct semantics come for free with native elements (`button`, `a`, form
controls) but have to be manually reimplemented — often incorrectly —
with styled `div`s. The hold sheet and contribute flow are modal
interactions that specifically need focus-trapping and dialog semantics.

## Decision

We will implement the hold sheet and contribute flow with the native
HTML `<dialog>` element rather than a hand-built focus trap; keyboard
navigation elsewhere uses native interactive elements with visible focus
indicators; full-screen item detail explicitly moves focus to its
heading on open and returns it on close; and drag-to-reorder gets a
keyboard-operable move-up/move-down alternative.

## Alternatives considered

- **Hand-built focus trap for the hold sheet and contribute flow** —
  rejected: native `<dialog>` provides focus-trapping, `Escape`-to-close,
  and correct dialog semantics natively, avoiding exactly the class of
  subtle focus-trap bug that automated tools like `axe` won't catch. A
  custom implementation remains the documented fallback only if
  `<dialog>`'s default behavior doesn't fit the intended design.
- **Replace drag-and-drop reorder with keyboard controls** — rejected:
  drag remains the primary and faster interaction for sighted mouse/touch
  users, so the keyboard controls are additive to the existing
  drag-and-drop, not a replacement.

## Consequences

- Browsers don't move focus automatically on the kind of in-page
  navigation full-screen item detail uses, unlike `<dialog>`'s native
  modal focus handling — so that focus management has to be implemented
  explicitly rather than assumed to come free.
- `<dialog>`'s well-supported browser matrix ([accessibility & browser
  support](../spec/accessibility-and-browser-support.md)) means this doesn't reopen the browser-support question
  (ADR-[027](./0027-browser-support-matrix-widened-for-the-guest-facing-surface.md)).
- Screen-reader status changes surfaced within these flows still need
  their own live-region handling (ADR-[025](./0025-screen-reader-status-changes-use-aria-live-regions.md)) — `<dialog>` solves focus and
  keyboard semantics, not announcement.
