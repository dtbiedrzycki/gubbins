# 0002. Holds are 3-day, extendable once, operator-configurable duration

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Holds are 3-day, extendable once, with lazily computed expiry; duration is operator config (HOLD_DURATION_DAYS) and the extension adds the same again, so maximum single-item exposure is 2 × the configured duration
