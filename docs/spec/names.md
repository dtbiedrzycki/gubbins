# Names


- `holderName` / `contributorName` required, trimmed, non-empty,
  length-capped — stored as `GuestPii.name` (§[2](domain-model.md), ADR-[059](../adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)), not directly
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
  thank-you tracking and reconciliation, §[3.14](owner-dashboard.md), §[3.6](manual-contributions.md)), but "required"
  means recorded for the owner, never means visible to the guest
  community. *(ADR-[044](../adr/0044-anonymous-contributions-resolved-name-required-owner-only.md))*

### 3.3 Holds (single items)

---

[← Back to spec index](README.md)
