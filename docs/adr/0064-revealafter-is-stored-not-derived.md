# 0064. revealAfter is stored, not derived

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

ADR-[070](./0070-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md)
rejected storing `revealAfter` as a fixed instant on the grounds that it
"would make the timezone field silently ineffective after the fact."
As derived, `revealAfter` was described as such in
[domain model](../spec/domain-model.md), while
[time & timezones](../spec/time-and-timezones.md) allowed an owner to
set it explicitly with no field to hold that choice — so
[owner dashboard](../spec/owner-dashboard.md)'s re-derivation on an
`eventDate` or `timezone` edit would silently discard it. Revisiting
`revealAfter`'s "silently ineffective" objection resolved this: the
load-bearing word is *silently*, and it turns out not to hold, since
[owner dashboard](../spec/owner-dashboard.md) and
[time & timezones](../spec/time-and-timezones.md) both already require
the settings screen to show `revealAfter` and `purgeAt` as resolved
instants.

## Decision

We will store `revealAfter` as a fixed instant set at creation from a
prefilled, editable local date-time field, not derive it from
`eventDate` at read time; a later `eventDate` or `timezone` edit
re-resolves only `purgeAt`. This reverses
ADR-[070](./0070-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md)'s
rejection of a stored instant. `purgeAt` stays derived and
operator-governed, since retention is the operator's controller
obligation, not the owner's choice.

## Alternatives considered

- **Keep `revealAfter` derived from `eventDate` at read time**
  (ADR-070's original choice) — rejected on reexamination: an owner who
  sets 11:59pm on 14 June in London and later switches the list to New
  York sees that same moment rendered as 6:59pm — the instant has not
  moved, only its local reading has, and the change is on screen at the
  point of editing. Visible, not silent, so the objection that motivated
  keeping it derived does not hold.
- **A second field (`revealAfterOverride`) holding an explicit value
  alongside the derived default** — rejected: it achieves the same
  outcome as storing the instant directly, but with two fields and a
  precedence rule between them instead of one field and none.

## Consequences

- Removes a genuine defect: as derived, an `eventDate` or `timezone` edit
  would silently discard an owner's explicit `revealAfter` choice, since
  no field existed to hold it. Storing the instant directly closes this.
- Does not reopen
  ADR-[049](./0049-civil-dates-and-instants-modelled-distinctly-via-per-list.md)'s
  rejection of UTC-instant storage for `eventDate`: that objection was
  about asking a non-technical owner to pick the exact UTC instant their
  event ends. The question here is asked as a local date and time in
  the list's own timezone, prefilled with end-of-`eventDate` — the same
  treatment [time & timezones](../spec/time-and-timezones.md) already
  gives the timezone field itself. `eventDate` remains a civil date, and
  the instant/civil-date distinction stands untouched.
- `purgeAt` deliberately stays derived:
  ADR-[056](./0056-privacy-notice-rendered-by-the-app-with-operator-contact.md)
  makes the operator the GDPR data controller, and the operator is not
  always the owner; letting an owner set an arbitrary deletion instant
  would hand away control of data the operator is answerable for.
  Reveal timing is a product choice belonging to the owner; retention is
  a policy belonging to the operator, governed by `PURGE_AFTER_DAYS`
  ([ops](../spec/ops.md)). The split follows responsibility rather than
  convenience.
- This Decision is load-bearing for two other ADRs:
  ADR-[020](./0020-owner-status-identity-visibility-auto-reveals-at-revealafter.md)
  already references `revealAfter` as a stored instant, and
  ADR-[070](./0070-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md)
  (partially superseded by this decision) depends on it being stated
  precisely and unambiguously going forward.
