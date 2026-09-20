# 0026. Screen-reader status changes use ARIA live regions

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Screen-reader status changes use ARIA live regions — `polite` for success confirmations, `assertive` for field-level validation errors — not visual-only toasts; status badges pair icon and text, never color alone

## Detail

**ADR-026 detail:** Visual-only toast/snackbar components are invisible to screen-reader users unless wired to an ARIA live region — a common accessibility gap. `polite` vs. `assertive` is chosen based on urgency: a success confirmation can wait for a natural pause in speech output, but a validation error blocking form submission should interrupt immediately so the user doesn't try to submit again into the same wall.
