# 0028. Browser support matrix widened for the guest-facing surface

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The browser support matrix was initially set to the last 2 versions of
evergreen browsers plus current iOS Safari/Chrome Android, following
general web-app usage patterns. A wedding or baby-shower guest list's
actual audience — relatives, often on older, un-upgraded devices,
including iPhones hardware-capped below the current iOS version (which
caps their Safari version with it) — is a weaker fit for that generic
assumption than a typical app's audience would be.

## Decision

We will widen the browser support matrix to the last 4 major versions of
evergreen browsers (and iOS Safari/Chrome Android) for the guest-facing
surface; the owner dashboard keeps the last-2-versions target; and the
hold and contribute flows are additionally required to degrade
gracefully — remaining functionally submittable, even if visually
plainer — rather than hard-fail below the version floor.

## Alternatives considered

- **Keeping a single "last 2 versions / current" matrix for the whole
  app** — rejected: a wedding/baby-shower guest list skews toward
  relatives on older, un-upgraded devices, including iPhones
  hardware-capped below the current iOS (and therefore Safari) version,
  making the generic evergreen-browser assumption a weaker fit for this
  project's actual audience than for a typical app.
- **Applying the same widened matrix to the owner dashboard** —
  rejected: owners remain a small, self-selected group unlikely to be on
  legacy devices, so the tighter last-2-versions target is still the
  right fit there; the two surfaces reasonably have different matrices
  given their different audiences.
- **Hard-failing below the version floor on the hold/contribute flows**
  — rejected: these are the money/commitment-critical paths, where a
  silent failure has the highest cost, so graceful degradation
  (functionally submittable, cosmetically plainer) is required instead.

## Consequences

- Two different browser matrices apply: last 4 versions for the
  guest-facing surface, last 2 for the owner dashboard.
- The hold and contribute flows must be built on semantic HTML forms and
  standard `fetch` rather than bleeding-edge CSS/JS features, so that
  submission still works even where cosmetic polish doesn't. See
  [accessibility & browser
  support](../spec/accessibility-and-browser-support.md).
