# Markdown Plain Blocks, Nested Lists and Checklists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Headings, code blocks and tables render as spaced plain paragraphs; sub-lists and loose lists space evenly; checklist items show ☐/☑.

**Architecture:** A hand-written rehype plugin rewrites the HTML tree before react-markdown's `allowedElements` filter, so the allowlist is unchanged. Two Tailwind arbitrary-variant classes on `ul`/`ol` fix list spacing.

**Tech Stack:** React, react-markdown 10 (`rehypePlugins`), Tailwind CSS 4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-15-markdown-plain-blocks-design.md`

## Global Constraints

- `allowedElements`, `unwrapDisallowed`, `urlTransform` and the "no rehype-raw" rule stay exactly as they are.
- No new dependencies. Types may be imported type-only from `hast` (already installed with react-markdown).
- Table cells are joined by ` · ` (space, U+00B7, space); rows and code lines are separated by `br`.
- Checklist markers are `☐` (U+2610) and `☑` (U+2611), followed by the item's text.
- Tests go through `Markdown`'s rendered output, one rule per test, no plan or spec references in names.
- Builds on #274; one PR, 5 files (spec, plan, `Markdown.tsx`, new plugin file, `Markdown.test.tsx`).

## Review Focus

- A heading with a link or bold inside: the link still opens safely (same `a` rules), bold kept.
- A fenced code block with a blank line inside: one paragraph, no empty-line collapse surprises (an empty line gives two `br`s in a row).
- A table with an empty cell or a header-only table: no crash; a dangling ` · ` is acceptable.
- `[x]` in the middle of a sentence or in a plain (non-task) list: stays literal text, no symbol.
- A checklist item collapsed in the two-line clamp: symbol and text still clip correctly (manual check, Task 2).

---

### Task 1: Rewrite step for headings, code, tables and checkboxes

**Files:**
- Create: `apps/web/src/lib/rehypePlainBlocks.ts`
- Modify: `apps/web/src/lib/Markdown.tsx` (pass `rehypePlugins={[rehypePlainBlocks]}`)
- Test: `apps/web/src/lib/Markdown.test.tsx`

**Interfaces:**
- Produces: `export function rehypePlainBlocks(): (tree: Root) => void` (`Root` from `hast`), mutating the tree in place.

- [ ] **Step 1: Write the failing tests** in `Markdown.test.tsx`

```tsx
it('gives a heading its own paragraph', () => {
  const { container } = render(<Markdown text={'# Shipping\n\nJane Doe'} />);
  expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Shipping', 'Jane Doe']);
});

it('keeps a link inside a heading', () => {
  render(<Markdown text="# See [site](https://example.com)" />);
  expect(screen.getByRole('link', { name: 'site' }).closest('p')).not.toBeNull();
});

it('shows a code block as a paragraph with one line per code line', () => {
  const { container } = render(<Markdown text={'```\nline one\nline two\n```'} />);
  expect(container.querySelector('p')?.innerHTML).toBe('line one<br>line two');
});

it('shows a table as a paragraph with one row per line and cells separated by a dot', () => {
  const { container } = render(<Markdown text={'| Size | Colour |\n|---|---|\n| M | Red |'} />);
  expect(container.querySelector('p')?.innerHTML).toBe('Size · Colour<br>M · Red');
});

it('marks checklist items as ticked or unticked', () => {
  const { container } = render(<Markdown text={'- [ ] socks\n- [x] books'} />);
  expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['☐ socks', '☑ books']);
});

it('leaves [x] in ordinary text as typed', () => {
  render(<Markdown text="Tick [x] when done" />);
  expect(screen.getByText('Tick [x] when done')).toBeTruthy();
});
```

The existing test "keeps the text of headings, code and quotes without their elements" stays as it is.

- [ ] **Step 2: Run them and see them fail**

Run: `npm -w apps/web test -- src/lib/Markdown.test.tsx --testTimeout=30000`
Expected: the first five new tests FAIL; "leaves [x] in ordinary text as typed" and all existing tests PASS.

- [ ] **Step 3: Implement `rehypePlainBlocks` and wire it into `Markdown`**

A recursive walk over `element` nodes:
- `h1`–`h6`: set `tagName` to `p`, keep children and drop properties.
- `pre`: replace with a `p` whose children are the code's text lines (split on `\n`, final empty line dropped) separated by `br` elements.
- `table`: replace with a `p`; for each `tr` (in `thead` and `tbody`), the cells' (`th`/`td`) children joined by text ` · `, rows separated by `br`.
- `input` with `properties.type === 'checkbox'`: replace with text `☐` or `☑` from `properties.checked`. The text after it already starts with a space.

Text nodes between table parts (whitespace) are ignored.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm -w apps/web test -- src/lib/Markdown.test.tsx --testTimeout=30000`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/rehypePlainBlocks.ts apps/web/src/lib/Markdown.tsx apps/web/src/lib/Markdown.test.tsx
git commit -m "fix(web): show headings, code, tables and checklists as plain text"
```

### Task 2: Even spacing for nested and loose lists

**Files:**
- Modify: `apps/web/src/lib/Markdown.tsx` (`ul` and `ol` class names)
- Test: `apps/web/src/lib/Markdown.test.tsx`

**Interfaces:**
- Consumes: the `ul`/`ol` overrides from #274 (`mt-3 first:mt-0 list-disc|list-decimal pl-5`).

- [ ] **Step 1: Write the failing tests**

```tsx
it('puts a sub-list directly under its item', () => {
  const { container } = render(<Markdown text={'- **a**\n  - b'} />);
  expect(container.querySelector('li ul')?.className).toContain('[li>&]:mt-0');
});

it('separates the items of a list written with blank lines by the paragraph gap', () => {
  const { container } = render(<Markdown text={'- a\n\n- b'} />);
  expect(container.querySelector('ul')?.className).toContain('[&>li:has(>p)+li]:mt-3');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm -w apps/web test -- src/lib/Markdown.test.tsx --testTimeout=30000`
Expected: both new tests FAIL.

- [ ] **Step 3: Add `[li>&]:mt-0 [&>li:has(>p)+li]:mt-3` to both the `ul` and `ol` class names**

- [ ] **Step 4: Run the tests and see them pass**

Run: same command. Expected: all PASS.

- [ ] **Step 5: Confirm Tailwind emits both variants**

Run: `npm -w apps/web run build` then grep `apps/web/dist/assets/*.css` for `li>` and `:has(`.
Expected: both rules present.

- [ ] **Step 6: Manual look**

Render the component's output for headings, a code block, a table, a nested list under bold and plain items, a loose list and a checklist with the built CSS in Chromium at 360px; also collapsed with `line-clamp-2`. Expected: every block spaced alike, sub-lists tight under their item, loose items spaced, ☐/☑ shown, clamp at two lines.

- [ ] **Step 7: Run the full local gate and commit**

Follow skill `verifying-gubbins-locally` (`--e2e`, announcing the run to the peer session).

```bash
git add apps/web/src/lib/Markdown.tsx apps/web/src/lib/Markdown.test.tsx
git commit -m "fix(web): space nested and loose markdown lists evenly"
```
