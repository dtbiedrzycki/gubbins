# 0025. Hold sheet and contribute flow use native <dialog>

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Hold sheet and contribute flow implemented with the native HTML `<dialog>` element rather than a hand-built focus trap; keyboard nav otherwise via native elements with visible focus indicators; full-screen item detail moves/returns focus explicitly; drag-to-reorder gets a keyboard-operable move-up/move-down alternative

## Detail

**ADR-025 detail:** Native elements are required rather than styled `div`s because keyboard operability, focus, and correct screen-reader semantics come for free with `button`/`a`/form controls and have to be manually reimplemented (often incorrectly) otherwise. For the hold sheet and contribute flow specifically, the native `<dialog>` element is used instead of a hand-built focus trap: it provides focus-trapping, `Escape`-to-close, and correct dialog semantics natively, avoiding exactly the class of subtle focus-trap bug that automated tools like axe won't catch. A custom implementation remains the fallback only if `<dialog>`'s default behavior doesn't fit the intended design. Explicit focus management is still called out for full-screen detail navigation, since browsers don't move focus automatically on that kind of in-page navigation the way `<dialog>` handles modal focus. Keyboard reorder controls are additive to the existing drag-and-drop, not a replacement, since drag remains the primary and faster interaction for sighted mouse/touch users.
