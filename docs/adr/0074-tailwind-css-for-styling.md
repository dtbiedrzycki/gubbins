# 0074. Tailwind CSS for styling

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** dtbiedrzycki

## Context

No prior ADR or spec topic addresses styling. The front-end is being
built by a contributor newer to front-end work than back-end, which
matters for which approach is easier to learn and stay consistent in
across many small feature-folder components ([front-end architecture](../spec/frontend-architecture.md)).

## Decision

We will use Tailwind CSS for styling, compiled at build time via
PostCSS (no CDN `<script>` include, consistent with the project's
no-outbound-requests-at-runtime principle).

## Alternatives considered

- **CSS Modules with plain CSS** — rejected for this project: more
  traditional and requires no new vocabulary, but leaves consistency
  across features to individual discipline (no shared spacing/color
  scale enforced by tooling), and separates markup from the styles that
  apply to it across two files per component.

## Consequences

- Utility classes live directly in JSX; there is no per-component
  `.module.css` file to keep in sync with markup changes.
- A `tailwind.config.js` at `apps/web/` defines the design tokens
  (spacing, color) once, giving later features a consistent scale to
  draw from rather than ad hoc values.
