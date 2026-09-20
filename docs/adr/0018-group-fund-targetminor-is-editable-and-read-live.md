# 0018. Group/fund targetMinor is editable and read live

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Group/fund `targetMinor` is editable at any time; read live, never snapshotted per contribution

## Detail

**ADR-018 detail:** Storing `priceMinor`/`targetMinor` as a value on each Contribution at pledge time was considered (a classic event-sourcing snapshot pattern) but rejected as premature — no requirement calls for reconstructing "what the target was on date X," and reading live keeps the domain model simpler. If historical target tracking becomes a real requirement, it can be added later without touching existing events.
