# 0089. The owner reveals who gave what on demand

- **Status:** Accepted
- **Date:** 2026-11-20
- **Deciders:** dtbiedrzycki

## Context

The owner wants to see who bought, held or pledged towards each gift: for
thank-you notes, for matching Venmo and Zelle payments to pledges, and for
the fun of watching when they don't mind spoilers. Until now the manage page
showed none of it. ADR-[0022](./0022-giver-message-visible-to-owner-immediately-not-spoiler-gated.md)
says messages reach the owner straight away, not held back by the spoiler
settings, but nothing displayed them.

The spoiler settings in the [owner dashboard spec](../spec/owner-dashboard.md)
(`ownerSeesClaimStatus`, `ownerSeesClaimerIdentity` and the reveal date of
ADR-[0020](./0020-owner-status-identity-visibility-auto-reveals-at-revealafter.md)
and ADR-[0070](./0070-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md))
were designed for this but never built. They need stored per-list settings,
an event date and a one-way reveal, which is more than the owner asked for.
The design is in the
[manage redesign spec](../superpowers/specs/2026-11-20-manage-redesign-design.md).

## Decision

Who gave what stays hidden on the manage page until the owner presses
"Show who gave what". That one control reveals the details under every gift
at once, and a reload hides them again.

Hidden covers only who and what they said: guest names, messages and dates.
Counts and progress ("1 of 3 bought · 1 held", "$100.00 of $180.00 pledged")
always show.

The names and messages come from their own owner-only request, made only on
reveal. The manage view never carries them, so they don't reach the browser
before the owner asks. A request from anyone but the owner gets the same
not-found answer as a list that doesn't exist
(ADR-[0016](./0016-no-public-list-directory-lookups-fail-generically.md)).

This is the owner's own choice, not a spoiler gate: the owner can press the
button at any time, so messages still reach them straight away as
ADR-0022 says. That ADR is amended to say so.

ADR-0020 and ADR-0070 stay accepted but unbuilt, as a possible later
addition. If they are built, their settings decide what this control may
reveal.

## Alternatives considered

- **Build the spoiler settings of ADR-0020/0070** — not now: per-list
  settings, an event date and a sticky reveal for a need that one button
  meets.
- **Names in the manage view, hidden by the web app** — rejected: every
  name and message would sit in the browser and the network tab on every
  visit, revealed or not.
- **A reveal per gift** — rejected by the owner in favour of one control for
  the whole list.
- **Remember the reveal in the browser** — not chosen: a reload hiding the
  details again keeps a guest at the owner's shoulder from seeing them by
  accident.

## Consequences

- A new owner-only route returns each gift's purchases, active holds and
  pledges with the guest's name and message, marked `no-store`. Its
  contract comes from the route, like every other
  (ADR-[0077](./0077-openapi-document-generated-from-route-schemas-is-the-api-contract.md)).
- Names and messages are read from the `guest_pii` side table
  (ADR-[0057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)).
  `GuestPiiRepository` gains a batch read, so the reveal costs one query for
  names however long the list is. Once erasure is built, an erased guest
  shows as "[Redacted]", as the owner dashboard spec says.
- The manage view gains a purchased count per gift, so "bought" and "held"
  can be told apart while the details stay hidden.
