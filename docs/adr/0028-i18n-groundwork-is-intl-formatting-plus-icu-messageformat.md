# 0028. i18n groundwork is Intl formatting plus ICU MessageFormat strings

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

No requirement or user demand for a shipped non-English UI exists yet,
which argues under YAGNI for deferring localization entirely. But
multilingual family guest lists (in-laws, international relatives) are a
plausible near-term case for this project's actual users, not a
hypothetical one — a materially weaker basis for a full deferral than a
typical B2B tool would have.

## Decision

We will build i18n groundwork as `Intl`-based formatting (currency,
date/time) plus a centralized strings module built on an ICU
MessageFormat-compatible library; no locale-switching UI or translated
string sets ship now.

## Alternatives considered

- **Standing up a full i18n/localization pipeline now** (translation key
  extraction, locale-switcher UI, translated string bundles) — rejected
  under YAGNI: no requirement or user demand for a shipped non-English UI
  exists yet, and building the full pipeline speculatively adds ongoing
  translation-maintenance burden to every future UI change.
- **A bare key-value strings object instead of an ICU
  MessageFormat-compatible module** — rejected: multilingual family
  guest lists are a plausible near-term case for this project's actual
  users, so plural/gender/variable handling needs to be translation-safe
  before any translation exists; a bare strings object would force a
  rewrite of the strings layer the first time a community-contributed
  locale file showed up.

## Consequences

- Currency and date/time formatting go through `Intl` now, and UI copy
  is centralized in one ICU MessageFormat-compatible strings module,
  both cheap to build today.
- A locale-switcher and translated string bundles remain deferred,
  unscheduled work — no non-English UI ships as part of this decision.
- A future community-contributed locale file (the expected path for an
  OSS project) requires no rewrite of the strings layer when it
  eventually arrives. See [accessibility & browser
  support](../spec/accessibility-and-browser-support.md).
