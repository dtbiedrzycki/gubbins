# 0056. Privacy notice rendered by the app, with operator contact

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

A notice to guests has to say what is collected, how long it is kept,
how to exercise access and erasure rights, and who the controller is and
how to reach them (GDPR Art. 13). The app knows the first three. It
deliberately collects nothing about the owner
([design principles](../../gubbins-spec.md#design-principles),
ADR-[001](./0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md)),
and the controller is the operator, who is not always the owner
([privacy](../spec/privacy.md)). Self-service access and erasure
(ADR-[058](./0058-guest-self-service-data-access-erasure-via-guestdataaccess.md))
does not remove the need for a contact: requests may arrive by any route,
and some personal data is out of its reach — manual contributions and
manual gift entries are recorded by the owner with no guest session
behind them, and a guest who has lost both session and durable link has
no way in.

## Decision

We will render an app-authored privacy notice on every list, after key
entry: what is collected, when it is deleted (`purgeAt` and the
giver-email purge, resolved for the list), the backup retention window,
and a link to `/wishlists/{slug}/my-data`. Controller identity and contact come
from an operator-set `PRIVACY_CONTACT` environment variable; when it is
unset, the notice says plainly that no contact has been provided. The
owner may add an optional `privacyNotice` note, shown beneath the app's
text.

## Alternatives considered

- **Owner-authored notice only, shown when set** — the previous
  decision, rejected: most lists would show guests nothing, and it asks
  the owner for the controller's details when the operator is the
  controller.
- **Docs-only** (a template with no app support) — rejected: a notice
  living only in a doc the operator may never open is easy to skip — the
  "remember to do X" failure mode
  ADR-[043](./0043-sourceurl-env-var-drives-agpl-3-0-network-use-compliance.md)'s
  `SOURCE_URL` avoids for AGPL compliance.
- **Auto-generation with the contact silently omitted** — rejected: a
  notice missing its most important part looks more complete than it
  is. Stating the gap keeps it honest.
- **Owner contact required at list creation** — rejected: it collects
  owner data the no-accounts principle rules out, from a party who is
  not necessarily the controller.

## Consequences

- Every list carries a notice, and the controller contact is set once
  per instance, like `SOURCE_URL`. An operator who leaves
  `PRIVACY_CONTACT` unset has that disclosed to guests rather than
  hidden.
- The notice, contact, and owner note render only after key entry.
  Before it, the key gate carries a static app-authored statement,
  identical on every slug: operator- or owner-specific content there
  would name the operator to anyone holding only a slug — an actor the
  [threat model](../spec/threat-model-summary.md) says should learn
  nothing — and a note rendered only when set would signal that the slug
  exists, reopening what
  ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md)
  closed and
  ADR-[054](./0054-post-purgeat-lookups-return-the-same-generic-not-found.md)
  declined to reopen.
