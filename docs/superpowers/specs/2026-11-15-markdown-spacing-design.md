# Markdown paragraph spacing and list bullets

## Why

Owners write list and item descriptions with blank lines between paragraphs
(an intro, then a shipping address, then delivery notes). Guests see the
paragraphs run together, so the blank lines look deleted. The text is stored
intact; the loss is visual. Tailwind's preflight sets `margin: 0` on `p` and
`list-style: none` on `ul`/`ol`, and nothing in the app restores either. The
same reset hides list bullets, although the create-list hint says
descriptions support lists.

## Goal

- Paragraphs and lists rendered by `Markdown` are separated by a visible gap.
- `ul` items show bullets, `ol` items show numbers.

## Non-goals

- Reproducing the exact number of blank lines typed. Several blank lines
  render as one paragraph gap, as Markdown defines.
- Any change to storage, the API or the forms. Single line breaks already
  work (`remark-breaks`) and stay as they are.
- Site-wide paragraph or list styles outside `Markdown`.

## Approaches

1. **Style blocks inside the `Markdown` component (chosen).** Gap above
   every top-level block except the first; bullets/numbers on lists. Reaches
   every description (guest list page, owner list details, item cards) and
   nothing else.
2. Rewrite each extra blank line into a visible empty line before rendering.
   Matches typed spacing exactly but fights Markdown parsing (splits lists
   and paragraphs oddly) and is more code.
3. A global CSS rule for `p + p` and lists. Same size, but changes spacing
   on every page, including copy laid out assuming no gaps.

## Design

All in `apps/web/src/lib/Markdown.tsx`:

- Gap between blocks: roughly one line (e.g. `mt-3`, `first:mt-0`, or a
  `[&>*+*]` selector on a wrapper) on `p`, `ul`, `ol`.
- Lists: `list-disc` / `list-decimal` with left padding so markers sit
  inside the text column.

One test in `Markdown.test.tsx` for the user-visible rule (blank line →
separate, spaced paragraphs; lists carry their markers), asserting the
classes or computed style that produce it.

## Left to the builder

- Exact spacing value and whether it goes on per-element `components` or a
  wrapper selector (ReactMarkdown 10 has no `className` prop).
- Check the two-line `ClampedText` clamp still measures and clips correctly
  with spaced blocks and list markers on the guest list page and item cards.
