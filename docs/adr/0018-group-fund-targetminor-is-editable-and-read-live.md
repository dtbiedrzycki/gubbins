# 0018. Group/fund targetMinor is editable and read live

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Group and fund items carry a `targetMinor` that guests contribute against
([group gifts & funds](../spec/group-gifts-and-funds.md)). Owners can change
the price or target at any time, including after contributions already
exist, and each contribution needs a target to read against — either the
value in effect when it was pledged, or the value in effect right now.

## Decision

We will keep group/fund `targetMinor` editable at any time and read it
live at contribution time, never snapshotted onto the Contribution itself.

## Alternatives considered

- **Snapshot `targetMinor` onto each Contribution at pledge time** (a
  classic event-sourcing snapshot pattern) — rejected as premature: no
  requirement calls for reconstructing "what the target was on date X,"
  and reading live keeps the domain model simpler.

## Consequences

- No historical-target rewrite risk: an owner editing the target after
  contributions exist doesn't require touching existing events or rows.
- If historical target tracking becomes a real requirement later, it can
  be added without touching existing events — the live-read design doesn't
  foreclose it.
- This is a distinct, narrower question than ADR-[047](./0047-contribution-snapshots-its-payment-method-at-pledge-time.md), which snapshots
  a *payment method* onto a Contribution for an unrelated reason (so a
  later edit to the method's label/handle doesn't rewrite reconciliation
  history). That snapshot doesn't reopen this one: `targetMinor` stays
  live-read, only the payment method is snapshotted.
