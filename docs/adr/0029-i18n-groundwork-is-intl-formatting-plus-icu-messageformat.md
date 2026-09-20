# 0029. i18n groundwork is Intl formatting plus ICU MessageFormat strings

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

i18n groundwork is `Intl`-based formatting plus an ICU MessageFormat-compatible centralized strings module (stronger readiness bar than a bare strings object, given multilingual family guest lists are a plausible near-term case); no locale-switching or translated string sets shipped now

## Detail

**ADR-029 detail:** Rejected alternative: standing up a full i18n/localization pipeline (translation key extraction, locale-switcher UI, translated string bundles) now. Still rejected under YAGNI — no requirement or user demand for a shipped non-English UI exists yet, and building the full pipeline speculatively adds ongoing translation-maintenance burden to every future UI change. However, the deferral was reconsidered given that multilingual family guest lists (in-laws, international relatives) are a plausible near-term case for this project's actual users, not a hypothetical one — a materially weaker basis for deferral than a typical B2B tool would have. The resolution strengthens the groundwork rather than reversing the deferral: the centralized strings module is built on an ICU MessageFormat-compatible library from the start (not a bare key-value strings object), so plural/gender/variable handling is translation-safe before any translation exists, and a future community-contributed locale file requires no rewrite of the strings layer. `Intl`-based formatting and this stronger strings-module foundation are cheap now; a locale-switcher and translated bundles remain future, unscheduled work.
