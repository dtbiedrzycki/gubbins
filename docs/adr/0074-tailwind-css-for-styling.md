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

We will use Tailwind CSS for styling, compiled at build time by
Tailwind's first-party Vite plugin (no CDN `<script>` include,
consistent with the project's no-outbound-requests-at-runtime
principle).

## Alternatives considered

- **CSS Modules with plain CSS** — rejected for this project: more
  traditional and requires no new vocabulary, but leaves consistency
  across features to individual discipline (no shared spacing/color
  scale enforced by tooling), and separates markup from the styles that
  apply to it across two files per component.

## Consequences

- Utility classes live directly in JSX; there is no per-component
  `.module.css` file to keep in sync with markup changes.
- Design tokens (spacing, color) are declared once in a `@theme` block
  in `apps/web/src/index.css`, giving later features a consistent scale
  to draw from rather than ad hoc values. Tailwind is configured in CSS,
  so there is no `tailwind.config.js` and no `postcss.config.js`.
- Autoprefixer is not needed; Tailwind handles vendor prefixing
  internally.
- Tailwind's generated CSS depends on `oklch()`, `@property` and
  `color-mix()`, which sets a hard floor of Chrome/Edge 111, Safari 16.4
  and Firefox 128. Safari 16.4 implies iOS 16.4, so iPhone 7 and older
  are excluded. Unsupported browsers do not degrade gracefully — color
  and layout break — making this a product constraint, not only a build
  detail.
