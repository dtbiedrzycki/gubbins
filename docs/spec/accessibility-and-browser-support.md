# Accessibility & browser support

- **WCAG target: 2.2 Level AA**, across both guest and owner UI — upgraded
  from an initial 2.1 target once it was noted that 2.2's SC 2.5.7
  (Dragging Movements) directly covers the keyboard-alternative requirement
  already specified below for drag-to-reorder, making 2.2 the better fit
  rather than an arbitrary version bump. AA remains the level (not AAA):
  it's what ADA expectations, Section 508, and EN 301 549 reference as the
  practical baseline, and AAA's contrast/timing requirements conflict with
  normal visual design work without being expected anywhere this project
  would ship. *(ADR-[023](../adr/0023-wcag-2-2-level-aa-is-the-accessibility-target.md))*
- **Keyboard navigation**: every interactive control reachable and operable
  via keyboard, built from native semantic elements (`button`, `a`, form
  controls) rather than `div`/`span` with click handlers. Visible focus
  indicators are never removed, only restyled to match the design. Tab order
  follows visual/reading order. A skip-to-content link is provided on the
  guest browse page ahead of the filter/sort controls.
- **Focus management**:
  - Opening the full-screen item detail view moves focus to its heading;
    closing it (or navigating back) returns focus to the card that opened it.
  - The hold sheet and contribute flow are implemented with the native HTML
    `<dialog>` element rather than a hand-built focus trap — it provides
    focus-trapping, `Escape`-to-close, and correct dialog semantics without
    reimplementing them, and is well-supported across the browser matrix
    below. A custom focus-trap implementation is the documented fallback
    only if `<dialog>` proves too constraining for the intended design.
    *(ADR-[024](../adr/0024-hold-sheet-and-contribute-flow-use-native-dialog.md))*
  - Drag-and-drop reorder ([owner dashboard & editing rules](owner-dashboard.md)) gets a keyboard-operable alternative —
    move-up/move-down buttons alongside the drag handle — since drag
    gestures have no keyboard equivalent by default. Presentation-layer
    addition only; the underlying `sortOrder` mechanism is unchanged.
- **Screen-reader announcements**: a dedicated ARIA live region carries
  status changes rather than relying on visual-only toasts.
  - Success confirmations (hold confirmed, contribution recorded) use
    `aria-live="polite"` — announced without interrupting whatever the user
    is doing.
  - Validation errors use `aria-live="assertive"`, associated with the
    specific field (e.g., "Name is required"), since these need immediate
    attention before the guest can proceed.
  - Status badges (Available / Held / Purchased / Funded) always pair an
    icon and text label — never color alone.
- **`axe` in the Playwright run**: `@axe-core/playwright` is wired into the
  existing guest-flow e2e suite ([testing](testing.md)), scanning the key gate, browse view,
  item detail, hold sheet, contribute flow, and — on the owner side — the
  dashboard, reconciliation view, and thank-you view. CI fails the build on
  **serious/critical** violations; moderate/minor violations are logged as
  warnings. Because automated tools like axe are widely cited as catching
  only roughly 30–50% of real WCAG issues (they can't verify a live region
  actually announces correctly in a screen reader, or that tab order is
  *logically* sane rather than merely present), CI is not treated as
  sufficient on its own: a manual keyboard-only pass and a manual
  screen-reader pass on the hold and contribute flows (the two
  commitment-critical paths) are required before v1, tracked as a release
  checklist item rather than left as an informal recommendation. The
  moderate/minor ratchet also gets a concrete checkpoint — **zero moderate
  violations required before the v1.0 release** — tracked as a Forgejo
  issue, rather than an open-ended "tighten over time" intention that could
  silently become permanent debt. *(ADR-[026](../adr/0026-axe-core-wired-into-e2e-ci-blocks-on-serious-critical-only.md))*
- **Browser support matrix**: last 4 major versions of Chrome, Firefox,
  Safari, and Edge, and the last 4 major versions of iOS Safari and Chrome
  for Android — widened from an initial "last 2 / current" target once it
  was noted that a wedding/baby-shower guest list skews toward relatives on
  older, un-upgraded devices, including iPhones capped below the current
  iOS version (and therefore capped below the current Safari version too).
  No support target for Internet Explorer or legacy (pre-Chromium) Edge.
  Beyond the version floor, the **hold and contribute flows specifically**
  must degrade gracefully rather than fail outright on an unsupported or
  older browser: they rely on semantic HTML forms and standard `fetch`,
  avoid depending on bleeding-edge CSS/JS features for the ability to
  *submit*, and cosmetic degradation (older visual styling, missing
  animation) is acceptable where functional failure is not. The owner
  dashboard keeps the tighter "last 2 versions" target, since owners are a
  small, self-selected group unlikely to be on legacy devices — this
  distinction reflects the different audiences of the two surfaces rather
  than a single uniform matrix. *(ADR-[027](../adr/0027-browser-support-matrix-widened-for-the-guest-facing-surface.md))*
- **i18n groundwork (formatting, not translation)**: all currency and
  date/time display goes through `Intl.NumberFormat`, `Intl.DateTimeFormat`,
  and `Intl.RelativeTimeFormat` (e.g., "expires in 2 days") rather than
  manual string building, using the item's stored currency and the request's
  browser/`Accept-Language` locale for formatting. UI copy is centralized in
  a single strings module, built on an ICU MessageFormat-compatible library
  (e.g. `intl-messageformat`) rather than plain template strings, so
  plurals/gender/variable interpolation are translation-safe from day one
  even though no translations ship yet — a stronger technical readiness bar
  than a bare strings object, adopted specifically because multilingual
  family guest lists (in-laws, international relatives) are a plausible
  near-term need for this project's actual users, not a hypothetical one a
  typical B2B tool could safely wave off. No locale-switcher or translated
  string sets ship now — full localization delivery is still deferred under
  YAGNI, since no requirement calls for a shipped non-English UI today —
  but the groundwork is deliberately built so a future translation pass
  (community-contributed locale files are the expected path for an OSS
  project) requires no rewrite. Presentation-layer only, no domain impact.
  *(ADR-[028](../adr/0028-i18n-groundwork-is-intl-formatting-plus-icu-messageformat.md))*

---

[← Back to spec index](README.md)
