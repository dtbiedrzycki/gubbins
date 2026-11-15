# Markdown plain blocks, nested lists and checklists

## Why

Paragraph gaps and list markers (the markdown spacing design, same date)
made the remaining rough edges in owner descriptions visible:

- Headings, code blocks and tables already render as plain text, as the
  guest feedback design requires, but their text is left as a bare node
  with no block of its own. `# Shipping` sits flush against the next
  paragraph; a table collapses into one run-on line ("a b 1 2").
- Nested lists: a sub-list gets no gap under plain text but a gap under
  **bold** text. Items of a loose list (blank lines between them) have no
  gap between them.
- Checklists: `- [ ] socks` and `- [x] books` both render as plain
  bullets; the `[ ]`/`[x]` is consumed with the checkbox, so whether an
  item is ticked is lost.

## Goals

- Headings, code blocks and tables each become one plain paragraph, spaced
  like any other paragraph.
- A sub-list sits directly under its item, whatever the item's markup.
  Items of a loose list are separated by the paragraph gap.
- A checklist item starts with ☐ (unticked) or ☑ (ticked) and has no
  bullet (owner ruling, 2026-11-15); ordinary items in the same list keep
  theirs. Nothing is clickable.

## Non-goals

- Styling headings (bold, size) or code (monospace): plain text stays the
  rule.
- Any change to the allowed elements, link rules, or storage.

## Approaches

1. Widen the allowlist (input, table parts) and redraw them in
   `components`. Fewest lines, but grows the safety boundary for owner
   text and tables come out as mashed cells.
2. **A rehype step that rewrites the tree before filtering (chosen).** The
   allowlist stays as it is; each rule is a small, separately testable
   rewrite.
3. Rewrite the raw text with regexes before parsing. Breaks on `[x]`
   mid-sentence or `#` inside a link. Ruled out.

## Design

A rehype plugin in a new file next to `apps/web/src/lib/Markdown.tsx`,
passed as `rehypePlugins` (these run before `allowedElements`, so the
allowlist is unchanged). No new dependencies.

- `h1`–`h6` → `p`, keeping inline children (bold, links).
- `pre` → `p` holding the code's text, each line on its own line (`br`).
- `table` → `p`, one row per line (`br`), cells joined by ` · ` (my call).
- A task-list checkbox `input` → the text `☐ ` or `☑ ` in its place.
- Spacing (CSS in `Markdown.tsx`): a list inside a list item has no top
  margin; consecutive items of a loose list get the paragraph gap.

Tests go in `Markdown.test.tsx`, through `Markdown`'s rendered output (the
plugin is an implementation detail), one rule per test.

## Left to the builder

- Plugin file and function names; whether the tree walk is hand-written
  or uses a unist helper already installed as a direct dependency (adding
  one is out).
- The CSS selectors for the two spacing rules.
- Screen readers announce ☐/☑ by their Unicode names ("ballot box",
  "ballot box with check"); accept that unless it reads badly in a check.
