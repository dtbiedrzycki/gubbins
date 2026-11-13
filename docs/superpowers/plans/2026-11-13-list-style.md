# The owner picks a list style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner picks Storybook or Groovy for their list when editing its details. Guests and the owner see the list and manage pages in that style.

**Architecture:**
- Storage keeps the style as `wishlists.theme`, added by migration `0004`, defaulting to `storybook`.
- `Wishlist` owns the set of styles (`ListTheme`). `create` starts at `storybook`; `changeTheme` changes it.
- The guest view and the manage view return `theme`. The edit-list-details request requires it.
- On the web, a `useListTheme` hook sets `data-list-theme` on `<html>`. `index.css` redefines the theme tokens under `:root[data-list-theme="groovy"]`. Components don't change.

**Tech Stack:** TypeScript, Fastify + zod, Kysely/SQLite, React + TanStack Query, Tailwind 4, vitest + MSW.

**Spec:** `docs/superpowers/specs/2026-11-13-list-style-design.md` · mockup `docs/design/groovy-list-style-mockup.html` · ADR-0087.

## Global Constraints

- Every PR changes 10 files or fewer, generated files included (skill small-prs). Stack: Task 1 targets `main`, then Task 2 → 3 → 4 → 5 → 6, each built on the one below. The docs PR (spec, mockup, this plan, ADR-0087 and its README row) targets `main` separately.
- The values are exactly `'storybook' | 'groovy'`. The domain type is `ListTheme`; the wire schema is `listThemeSchema`. UI copy calls it "List style", with options "Storybook" and "Groovy".
- No CHECK on `wishlists.theme` (structural CHECKs only). Changing the style is not a ledger event.
- `theme` is required everywhere it appears: `Wishlist.reconstitute`, both views, the edit request. No optional-with-default.
- No plan identifiers in test names or comments. Domain instants are named `at`. Don't write tests that check removed code is absent.
- Before each push, follow skill verifying-gubbins-locally. Use `--e2e` for the PR that targets `main`. Web vitest in the dev container needs `--testTimeout=30000`. Run at most 3 verifies in parallel.
- Regenerate the contract with `npm run gen:api` whenever a schema changes; `apps/api/openapi.json` and `apps/web/src/api/schema.gen.ts` count towards the 10 files.
- Write PR bodies with skill writing-pr-descriptions. Self-review with skill reviewing-for-recurring-feedback. Run R1 and R2 before any PR opens (skill running-review-rounds).

## Review Focus

1. **Deploy onto the live database.** Every existing list reads back as `storybook`. Test: Task 1's adoption test.
2. **A bad value from storage or the wire.** `reconstitute` with an unknown theme throws; the edit request with an unknown theme answers 400. Tests: Task 2's `reconstitute` test, Task 6's schema table and its route test.
3. **Leaving a Groovy page.** Going from a Groovy list to the home page puts the Storybook look back. Test: Task 5's hook test.

---

### Task 1: Storage has a theme column (no behaviour change)

**Files:**
- Create: `apps/api/src/infrastructure/db/migrations/0004_wishlist_theme.ts`
- Modify: `apps/api/src/infrastructure/db/migrations/index.ts`
- Modify: `apps/api/src/infrastructure/db/schema.ts`: `theme: Generated<string>` on `WishlistsTable`, so typed inserts that leave it out still compile.
- Modify: `apps/api/src/infrastructure/db/schema.integration.test.ts`

- [ ] **Step 1: Write the failing test.** In the adoption test (`adopts a database the first release created…`), expect `0004_wishlist_theme` in the recorded names, and expect the pre-existing row to select `theme: 'storybook'`. *(Protects: the column's default on existing rows.)*
- [ ] **Step 2: Run** `verify.sh --quick apps/api src/infrastructure/db`. Expected: FAIL.
- [ ] **Step 3: Implement** `alter table wishlists add column theme text not null default 'storybook'`, with a one-line doc comment like 0002's. Register it.
- [ ] **Step 4: Run** `verify.sh --quick apps/api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): wishlists store a theme; existing lists are storybook`.

### Task 2: The list owns its style

**Files:**
- Modify: `apps/api/src/domain/entities/Wishlist.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.test.ts`
- Modify: `apps/api/src/application/views/HoldView.test.ts`
- Modify: `apps/api/src/application/test-fakes/builders.ts` (only if its `reconstitute` call needs it)
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Modify: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Modify: `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`

**Interfaces:**
- Produces, from `Wishlist.ts`: `export const LIST_THEMES = ['storybook', 'groovy'] as const; export type ListTheme = (typeof LIST_THEMES)[number];`, a `theme: ListTheme` getter, `changeTheme(theme: string): void`. `reconstitute` takes a required `theme: string`.

- [ ] **Step 1: Write the failing tests:**
  - `Wishlist.test.ts`, under `Wishlist.create`: `it('starts a new list in the storybook style')`. *(Protects: `create`'s starting value.)*
  - `it('changes the style to groovy')`. *(Protects: `changeTheme`'s assignment.)*
  - `it('refuses an unknown style, keeping the one it had')`: `changeTheme('disco')` throws `DomainValidationError`; `theme` is still `storybook`. *(Protects: the check in `changeTheme`.)*
  - `it('refuses to rebuild a list stored with an unknown style')`: `reconstitute({ …, theme: 'disco' })` throws. *(Protects: the constructor's check.)*
  - Contract: `it('insert stores the style the list has')`: a list rebuilt as `groovy` and inserted loads as `groovy`. *(Protects: both adapters' insert of `theme`; the column default would hide a dropped value otherwise.)*
  - Contract: `it('save stores a changed style')`: a list loads as `storybook`; after `changeTheme('groovy')` and save it loads as `groovy`. *(Protects: both adapters' save and load of `theme`.)*
- [ ] **Step 2: Run** `verify.sh --quick apps/api src/domain/entities/Wishlist.test.ts src/application/test-fakes/InMemoryRepositories.contract.test.ts src/infrastructure/contracts.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** One private check used by the constructor and `changeTheme`. `create` passes `'storybook'` by name, not `LIST_THEMES[0]`. `save` updates `theme` alongside title and description when it changed. Pass `theme` at every `reconstitute` call.
- [ ] **Step 4: Run** `verify.sh --quick apps/api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): a list has a style, storybook or groovy`.

### Task 3: Guests' view returns the style

**Files:**
- Modify: `packages/shared-types/src/listView.ts`: `export const listThemeSchema = z.enum(['storybook', 'groovy']);` and `theme: listThemeSchema` on `listViewResponseSchema`.
- Modify: `apps/api/src/application/use-cases/GetListView.ts`
- Modify: `apps/api/src/application/use-cases/GetListView.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts` (generated)
- Modify: fixtures and exact-shape tests: `apps/web/src/pages/ListPage.test.tsx`, `apps/web/src/features/holds/useHoldItem.test.tsx`, `apps/web/src/features/holds/YourContributions.test.tsx`, `packages/shared-types/src/holdView.test.ts`, `apps/api/src/presentation/routes.integration.test.ts`. This makes 10 files, the cap: any further fixture means a split.

- [ ] **Step 1:** Extend `carries the list's description` to `carries the list's description and style`, with the list changed to `groovy`. *(Protects: `GetListView` mapping `theme`.)*
- [ ] **Step 2: Run**, expect FAIL; **implement**; `npm run gen:api`; fix fixtures (`theme: 'storybook'`); **run** `verify.sh --quick`. Expected: PASS.
- [ ] **Step 3: Commit** `feat(api): guests' list view says the list's style`.

### Task 4: The manage view returns the style

**Files:**
- Modify: `packages/shared-types/src/manageView.ts` (`theme: listThemeSchema`)
- Modify: `apps/api/src/application/use-cases/GetManageView.ts`
- Modify: `apps/api/src/application/use-cases/GetManageView.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts` (generated)
- Modify: `apps/api/src/presentation/routes.ts`: the edit route's 200 description says "details", since the style joins them in Task 6 (Task 6 is at the cap).
- Modify: manage fixtures: `apps/web/src/pages/ManagePage.test.tsx`, `apps/web/src/features/manage/ListDetails.test.tsx`, `apps/web/src/features/manage/ManageItems.test.tsx`.

- [ ] **Step 1:** Add the style to the existing manage-view mapping test, with the list changed to `groovy`. *(Protects: `GetManageView` mapping `theme`.)*
- [ ] **Step 2:** As Task 3.
- [ ] **Step 3: Commit** `feat(api): the manage view says the list's style`.

### Task 5: The pages wear the list's style

**Files:**
- Modify: `apps/web/src/index.css`: a `:root[data-list-theme="groovy"]` block redefining `--color-paper`, `-ink`, `-muted`, `-line`, `-moss`, `-petal`, `-gold`, `-wax`, `-brass` and `--font-display` with the spec's values.
- Modify: `apps/web/src/main.tsx`: import `@fontsource/shrikhand/latin-400.css`.
- Modify: `apps/web/package.json`, `package-lock.json` (`@fontsource/shrikhand@^5.3.0`)
- Create: `apps/web/src/lib/useListTheme.ts`, `apps/web/src/lib/useListTheme.test.ts`
- Modify: `apps/web/src/pages/ListPage.tsx`, `apps/web/src/pages/ManagePage.tsx`
- Modify: `apps/web/src/pages/ListPage.test.tsx`, `apps/web/src/pages/ManagePage.test.tsx`

**Interfaces:** `useListTheme(theme: ListTheme | undefined): void`. Sets `document.documentElement.dataset.listTheme` to the theme while mounted and while defined; deletes it on unmount or when the theme becomes undefined.

- [ ] **Step 1: Write the failing tests:**
  - `useListTheme.test.ts`: `it('puts the style on the page, and takes it off when the page goes')`, using `renderHook` with `groovy`, then `unmount`. *(Protects: the effect and its cleanup.)*
  - `ListPage.test.tsx`: `it("shows a groovy list in the list's style")`. *(Protects: `ListPage` passing `view.theme`.)*
  - `ListPage.test.tsx`: extend `goes back to the guest key when a refetch says the session is gone` with a Groovy first view; the key screen has no style attribute. *(Protects: passing no style while `sessionGone`.)*
  - `ManagePage.test.tsx`: `it('shows the token screen in the default style once the owner session has ended')`: Groovy while the list shows, none once the owner is sent back to the token screen. *(Protects: the manage page's wiring, and passing no style once `entered` is false.)*
- [ ] **Step 2: Run** `verify.sh --quick apps/web src/lib/useListTheme.test.ts src/pages/ListPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Call the hook in each page before any early return. Pass `undefined` while a gate shows (the cached view outlives the session).
- [ ] **Step 4: Run** `verify.sh --quick apps/web`. Expected: PASS. Take one screenshot of a Groovy list page and compare its colours and heading font with the mockup; the mockup's shapes are not built (see its "Not built" note).
- [ ] **Step 5: Commit** `feat(web): list and manage pages show the list's style`.

### Task 6: The owner picks the style

**Files:**
- Modify: `packages/shared-types/src/ownerEditing.ts` (`theme: listThemeSchema` on `editListDetailsRequestSchema`)
- Modify: `packages/shared-types/src/ownerEditing.test.ts`
- Modify: `apps/api/src/application/use-cases/EditListDetails.ts`, `EditListDetails.test.ts`
- Modify: `apps/api/src/presentation/routes.integration.test.ts` (existing edit-details bodies gain `theme`)
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts` (generated)
- Modify: `apps/web/src/features/manage/EditListDetailsForm.tsx`, `EditListDetailsForm.test.tsx`
- Modify: `apps/web/src/features/manage/ListDetails.tsx` (pass `theme={view.theme}`)

- [ ] **Step 1: Write the failing tests:**
  - `ownerEditing.test.ts`: `it.each(…)('refuses a style that is %s')` for a missing `theme` and `'disco'`; the description test's bodies only gain `theme`. *(Protects: the schema's required enum.)*
  - `routes.integration.test.ts`: `it('answers 400 for an unknown style')`, the route's one schema refusal, checking the `Invalid request` body (the domain's refusal is also a 400, with a different message). *(Protects: the route validating its body with the schema.)*
  - `EditListDetails.test.ts`: `saves the owner's edit` also saves `theme: 'groovy'`. *(Protects: the use case calling `changeTheme`.)*
  - `EditListDetailsForm.test.tsx`: `it("starts on the list's current style and sends the one the owner picks")`: rendered with `groovy`, Groovy is checked, the owner picks Storybook, and the exact payload has `theme: 'storybook'`. Starting off the default shows the form uses the current style. The first test's expected body only gains `theme: 'storybook'`. *(Protects: the radio group's state and the payload.)*
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement.** The form gets a `<fieldset>` with legend "List style" and two radios (`id="edit-list-theme-storybook"`, `id="edit-list-theme-groovy"`), below the description field. The use case calls `changeTheme` before `editDetails`, in the same unit of work.
- [ ] **Step 4:** `npm run gen:api`; **run** `verify.sh --quick`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: the owner picks the list's style`.
