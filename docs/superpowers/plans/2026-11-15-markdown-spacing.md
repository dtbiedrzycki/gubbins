# Markdown Paragraph Spacing and List Bullets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descriptions rendered by `Markdown` show a gap between paragraphs and markers on lists.

**Architecture:** Tailwind preflight zeroes `p` margins and `ul`/`ol` list styles. The `Markdown` component restores them for its own output through ReactMarkdown's `components` map, so only descriptions change.

**Tech Stack:** React, react-markdown 10, Tailwind CSS 4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-15-markdown-spacing-design.md`

## Global Constraints

- Change only `apps/web/src/lib/Markdown.tsx` and its test; no global CSS, no API, form or storage changes.
- Keep the existing safety rules untouched: `allowedElements`, `unwrapDisallowed`, `urlTransform={httpOnly}`, no `rehype-raw`.
- Test names and comments carry no plan or spec references.
- One PR, well under the 10-file cap (spec, plan, component, test).

## Review Focus

- A description with only one paragraph: no stray top gap above it (first block has no margin).
- A list right after a paragraph, or a paragraph right after a list: same gap as between paragraphs.
- Guest list page and item cards: the two-line "Show more" clamp still clips at two lines and the toggle still appears when text overflows (manual check, Task 1 Step 6).
- Owner list details (`ListDetails.tsx`, `text-muted` wrapper): spacing and bullets show there too (manual check, Task 1 Step 6).
- A list item that wraps onto a second line: the wrapped text lines up with the item text, not under the bullet (`pl-5` with outside markers).

---

### Task 1: Spacing and list markers in `Markdown`

**Files:**
- Modify: `apps/web/src/lib/Markdown.tsx`
- Test: `apps/web/src/lib/Markdown.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Markdown({ text }: { text: string })` unchanged in signature.

- [ ] **Step 1: Write the failing tests** in `Markdown.test.tsx`

jsdom does not apply Tailwind, so the tests pin the classes that produce the look.

```tsx
it('separates paragraphs split by a blank line with a gap', () => {
  const { container } = render(<Markdown text={'Hello\n\nShip to:\n1 Main St'} />);
  const [first, second] = container.querySelectorAll('p');
  expect(second.className).toContain('mt-3');
  expect(first.className).toContain('first:mt-0');
});

it('shows bullets on unordered lists and numbers on ordered lists, spaced from the text before', () => {
  const { container } = render(<Markdown text={'Ideas:\n\n- one\n- two\n\n1. first\n2. second'} />);
  expect(container.querySelector('ul')?.className).toEqual(expect.stringContaining('list-disc'));
  expect(container.querySelector('ol')?.className).toEqual(expect.stringContaining('list-decimal'));
  for (const list of container.querySelectorAll('ul, ol')) expect(list.className).toContain('mt-3');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm -w apps/web test -- src/lib/Markdown.test.tsx --testTimeout=30000`
Expected: the two new tests FAIL (`className` is empty); the existing ones pass.

- [ ] **Step 3: Add `p`, `ul`, `ol` entries to the `components` map in `Markdown.tsx`**

- `p`: `className="mt-3 first:mt-0"`
- `ul`: `className="mt-3 first:mt-0 list-disc pl-5"`
- `ol`: `className="mt-3 first:mt-0 list-decimal pl-5"`

Each renders its element with `children` only (drop react-markdown's `node` prop so it doesn't reach the DOM), like the existing `a` entry. Update the file's top comment only if it no longer describes the component.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm -w apps/web test -- src/lib/Markdown.test.tsx --testTimeout=30000`
Expected: all Markdown tests PASS, including the multi-line address test (still two `<br>`).

- [ ] **Step 5: Run the full local gate**

Follow the `verifying-gubbins-locally` skill (no `--e2e` needed until the PR targets main; announce any e2e run to the peer session first).
Expected: green.

- [ ] **Step 6: Manual look in the running app**

Create a list whose description is `Hi all\n\nShip to:\nJane Doe\n1 Main St\n\n- books\n- socks` and an item with a two-paragraph description. Check on the guest list page, an item card and owner list details: one-line gap between blocks, address lines stacked, bullets showing; collapse the description and confirm the clamp shows two lines and "Show more".

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/Markdown.tsx apps/web/src/lib/Markdown.test.tsx
git commit -m "fix(web): space description paragraphs and show list markers"
```
