# Names

- `holderName` / `contributorName` required, trimmed, non-empty,
  length-capped — stored as `GuestPii.name` ([domain model](domain-model.md), ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)), not directly
  on the Hold/Contribution row
- No anonymous path, no per-list toggle
- No uniqueness check — duplicate names are normal
- Escaped on output
- "Required" means *recorded*, not *always visible*; spoiler settings govern when the owner sees them
- Names are recorded but **never shown to other guests** — only the owner
  sees giver/holder identity, still gated by the existing spoiler toggles
  (`ownerSeesClaimStatus`, `ownerSeesClaimerIdentity`, `revealAfter`).
  This is a hard rule, not a per-list toggle: there is no configuration
  path for an owner to expose giver names to other guests (e.g. a
  pre-event "wall of thanks"). Confirmed as the resolution to the
  anonymous-contributions open question — a name is always required (for
  thank-you tracking and reconciliation, [owner dashboard & editing rules](owner-dashboard.md), [manual contributions](manual-contributions.md)), but "required"
  means recorded for the owner, never means visible to the guest
  community. *(ADR-[042](../adr/0042-anonymous-contributions-resolved-name-required-owner-only.md))*

---

[← Back to spec index](README.md)
