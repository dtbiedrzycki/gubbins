# Time, timezones & display

The spec distinguishes two kinds of time, which are stored and rendered
differently. Conflating them is the source of the failure this section
exists to prevent. *(ADR-[051](../adr/0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md))*

**Instants** — `expiresAt`, `pledgedAt`, `confirmedAt`, `archivedAt`,
`thankedAt`, `revealedAt`, and all event timestamps. Stored as UTC.
Unambiguous by construction; each viewer sees them in their own zone.

**Civil dates** — `eventDate`. A calendar day belonging to the event, not
a point in time. Stored as `YYYY-MM-DD` with no zone attached, and
resolved to instants only via the list's `timezone`.

**Resolution rules**

- `revealAfter` is a stored instant, set at creation from a prefilled
  field defaulting to the **end** of `eventDate` in the list timezone
  (23:59:59.999 local), so an event day is fully over before claim
  status reveals. The owner enters a local date and time; it is resolved
  through `timezone` at write and stored. Editing `eventDate` or
  `timezone` afterwards does not move it — the settings screen shows the
  stored instant resolved in the current zone, so any change in how it
  reads is visible at the point of editing. *(ADR-[066](../adr/0066-revealafter-is-stored-not-derived.md))*
- `purgeAt` is the end of `eventDate + PURGE_AFTER_DAYS` days in the list
  timezone.
- Hold `expiresAt` is a pure instant — `now + holdDuration` — with no
  timezone involvement at all. Its *display* is localized (below); its
  computation is not.
- The `Clock` port returns an instant only. No "today", no civil-date
  arithmetic below the presentation layer, so a zone can never be
  implied by omission.
- The list timezone defaults at creation from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to
  `DEFAULT_TIMEZONE` (§[3.11](ops.md)) when unavailable. Presented on the creation
  screen as a prefilled, editable field — visible enough to correct, not
  a question the owner must research.

**Display rules — timezone is always stated, never implied**

- Every absolute date or time shown to a guest or owner carries its zone.
  Rendering an instant in the viewer's local zone without saying so is the
  failure mode this rule targets: a guest cannot tell whether "expires
  Thursday 11pm" is their Thursday or the venue's, and the ambiguity lands
  hardest on exactly the commitment-critical paths (hold expiry, event
  date).
- Formatting via `Intl.DateTimeFormat` with `timeZoneName: 'short'` for
  compact contexts (cards, badges) and `'longGeneric'` where space allows
  (item detail, hold confirmation, owner dashboard) — per ADR-[029](../adr/0029-i18n-groundwork-is-intl-formatting-plus-icu-messageformat.md), never
  hand-built strings, and never a hardcoded abbreviation.
- **Where the viewer's zone differs from the list timezone**, times are
  rendered in the viewer's zone with the list zone shown alongside — e.g.
  "Held until Thu 14 Aug, 11:59 PM CEST (2:59 PM event time)". A relative
  in another country should never have to work out the offset themselves.
- **`eventDate` is shown as a civil date with the list timezone named**,
  never converted to the viewer's zone. A guest must not see "Event: 13
  June" because their phone sits behind the venue.
- **Relative time is always paired with a labelled absolute time**, never
  shown alone. `Intl.RelativeTimeFormat` output ("expires in 2 days") is
  zone-neutral and friendly but imprecise at the boundary, which is where
  a guest most needs certainty.
- **Screen-reader output uses the long zone name, not the abbreviation** —
  "Central European Summer Time", not "CEST", which reads as a nonsense
  word. Where the visible label is abbreviated, the accessible name
  carries the long form. Extends §[3.16](accessibility-and-browser-support.md). *(ADR-[051](../adr/0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md))*
- The owner's settings screen states the current list timezone plainly
  alongside the resolved `revealAfter` and `purgeAt` instants, so the
  consequence of the field is visible at the point of editing rather than
  discovered later.

---

[← Back to spec index](README.md)
