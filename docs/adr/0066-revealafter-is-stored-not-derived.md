# 0066. revealAfter is stored, not derived

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

`revealAfter` is a stored instant set at creation from a prefilled, editable local date-time field, not derived from `eventDate` at read time; a later `eventDate` or `timezone` edit re-resolves only `purgeAt`. Reverses ADR-[052a](./0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md)'s rejection of a stored instant, whose "silently ineffective" objection does not hold once the settings screen shows the resolved value. `purgeAt` stays derived and operator-governed, since retention is the operator's controller obligation, not the owner's choice

## Detail

**ADR-066 detail:** ADR-[052a](./0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md) rejected storing `revealAfter` as a fixed
instant on the grounds that it "would make the timezone field silently
ineffective after the fact." The load-bearing word is *silently*, and it
turns out not to hold: §[3.14](../../gubbins-spec.md#314-owner-dashboard--editing-rules) and §[3.22](../../gubbins-spec.md#322-time-timezones--display) both already require the settings
screen to show `revealAfter` and `purgeAt` as resolved instants. An owner
who sets 11:59pm on 14 June in London and later switches the list to New
York sees that same moment rendered as 6:59pm — the instant has not
moved, its local reading has, and the change is on screen at the point of
editing. Visible, not silent.

Storing it removes a genuine defect rather than trading one for another.
As derived, `revealAfter` was described as such in §[2](../../gubbins-spec.md#2-domain-model) while §[3.22](../../gubbins-spec.md#322-time-timezones--display) allowed
an owner to set it explicitly, with no field to hold that choice — so
§[3.14](../../gubbins-spec.md#314-owner-dashboard--editing-rules)'s re-derivation on an `eventDate` or `timezone` edit would silently
discard it. The considered fix was a second field
(`revealAfterOverride`) holding the explicit value alongside the derived
default. Storing the instant directly achieves the same outcome with one
field instead of two and no precedence rule between them.

This does not reopen ADR-[051](./0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md)'s rejection of UTC-instant storage for
`eventDate`. That objection was about asking a non-technical owner to
"pick the exact UTC instant your event ends." The question here is asked
as a local date and time in the list's own timezone, prefilled with
end-of-`eventDate` — the same treatment §[3.22](../../gubbins-spec.md#322-time-timezones--display) already gives the timezone
field itself: visible enough to correct, not something the owner must
research. `eventDate` remains a civil date and the instant/civil-date
distinction §[3.22](../../gubbins-spec.md#322-time-timezones--display) exists to protect is untouched.

`purgeAt` deliberately stays derived. ADR-[058](./0058-owner-configurable-privacynotice-field-shown-only-when-set.md) makes the operator the GDPR
data controller, and the operator is not always the owner; letting an
owner set an arbitrary deletion instant would hand away control of data
the operator is answerable for, and invites a retention date years out.
Reveal timing is a product choice belonging to the owner; retention is a
policy belonging to the operator, governed by `PURGE_AFTER_DAYS` (§[3.11](../../gubbins-spec.md#311-ops)).
The split follows responsibility rather than convenience.
