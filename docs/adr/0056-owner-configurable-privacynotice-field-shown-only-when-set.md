# 0056. Owner-configurable privacyNotice field, shown only when set

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

A GDPR-facing notice needs to say who is responsible for the data
collected and how to reach them — but the app deliberately never collects
that information about the owner (no accounts, no verified identity —
[design principles](../../gubbins-spec.md#design-principles),
ADR-[001](./0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md)).
Two stronger options were weighed against this gap before landing on an
owner-authored field.

## Decision

We will add an owner-configurable `privacyNotice` field to `Wishlist`,
rendered to guests when set and omitted entirely when not, paired with a
docs template. The app will not auto-generate this notice — it doesn't
know the operator's identity or jurisdiction, so an owner-authored notice
beats an inferred one.

## Alternatives considered

- **Docs-only** (a template with no app support) — rejected: a notice
  living only in a doc the operator may never open is easy to skip
  entirely — the same "remember to do X" failure mode
  ADR-[043](./0043-sourceurl-env-var-drives-agpl-3-0-network-use-compliance.md)'s
  `SOURCE_URL` field was introduced to avoid for AGPL compliance. The
  same fix applies here: turn "operator should remember" into "one field
  in settings."
- **Full auto-generation** (the app assembles a notice from `purgeAt` and
  the known data model, no owner input required) — rejected: the app can
  state *what* it stores and *when* it's deleted, but not *who* is
  responsible for it or how to reach them, which are the two things a
  GDPR-facing notice most needs and the two things this system
  deliberately never collects about the owner. An auto-generated notice
  with those parts silently missing would look more complete than it is.

## Consequences

- The chosen middle ground gets the "actually shown to guests" benefit of
  the stronger auto-generation option without the app asserting things it
  doesn't know.
- **Resolved within this decision:** rendering the owner-authored notice
  on the pre-authentication key gate was specified in
  [guest UX](../spec/guest-ux.md) and later removed. It failed twice
  over: the notice's whole purpose is naming the operator and how to
  reach them, so placing it pre-auth hands the operator's identity to
  anyone holding only a slug — an actor the
  [threat model](../spec/threat-model-summary.md) says should learn
  nothing — and because the notice rendered only when the field was set,
  its presence was itself a per-slug signal that the list existed and its
  owner had filled the field in, reopening exactly the enumeration
  question ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md)
  closed and ADR-[054](./0054-post-purgeat-lookups-return-the-same-generic-not-found.md)
  declined to reopen for a more sympathetic case. The resolution splits
  the surface: a static app-authored statement pre-auth, carrying only
  what the app actually knows and rendering unconditionally, and the
  owner-authored notice post-auth, where every flow that collects
  personal data already lives.
