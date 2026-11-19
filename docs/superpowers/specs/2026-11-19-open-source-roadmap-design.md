# Open-source readiness roadmap

- **Date:** 2026-11-19
- **Status:** Draft for owner approval

## Intent

The repository is public. The goal now is for strangers to **self-host**
gubbins: someone finds it, tries a demo without installing anything, and
then gets their own instance running from the README alone. Outside code
contributions are welcome but are not what this roadmap optimises for.

This document orders the work. It does not design each item: every item
gets its own short design (and, where it says so, an ADR change) when it
starts.

## Goals, non-goals, anti-goals

- **Goal:** a visitor goes from the README to the demo to a running
  instance without asking anyone.
- **Goal:** the owner-side screens look finished, because the demo shows
  them to every visitor.
- **Non-goals:** attracting code contributors; changing the signed-commit
  rule; a server-hosted demo; rewriting git history (the old private links
  in history are already public, so a rewrite gains nothing).
- **Anti-goals:**
  - A demo that behaves differently from a real instance.
  - A demo that sends anything to a server, or that a visitor could
    mistake for a real place to keep a list.
  - Strangers self-hosting an instance that is open to cheap abuse once
    the project is announced (see Gate 2).

## Constraints

From `AGENTS.md`: at most 10 changed files per PR and 8 open stacked PRs;
docs and ADRs in their own PRs; one route or API contract change per PR;
`scripts/verify.sh --e2e` before anything targets `main`. ADRs are amended
in place while on 0.x.

## Gate 1: before the demo goes live

In this order. Sizes are rough counts of 10-file PRs.

1. **Turn CI back on** (~1 PR plus a docs PR). GitHub Actions minutes are
   free for public repos, so the existing `ci.yml` (signatures, lint,
   tests, build, e2e, container smoke) runs again on every PR and on
   pushes to `main`. Set `core.hooksPath` back to `.githooks` and update
   the "CI is turned off" text in `AGENTS.md` and `CONTRIBUTING.md`.
   `scripts/verify.sh` stays as the local check. Needs `gh` logged in
   again (it currently returns 401).
   *Builder's call, for the owner to check:* CI becomes the binding gate.
   The CI jobs become required checks on `main` (an owner step in the
   repo's GitHub ruleset, named in the PR's heads-up). The private pre-push
   gate that refuses unverified pushes is retired; the repo's `.githooks`
   keep checking signatures, and running `verify.sh` before pushing stays
   recommended, not enforced.
2. **Centre the manage page** (~1 PR). `ManagePage.tsx` holds a
   left-aligned `max-w-sm` column; centre it the way the guest list page
   is.
3. **Manage page redesign: one design, one mockup** (design and docs
   PRs, then ~6–8 PRs). Descriptions, gift details and fewer buttons all
   change the same gift row, so they are designed together, with the
   drag handle from item 4, in one mockup under `docs/design/` that the
   owner picks from. Built in this order:
   - **Descriptions on each gift.** Today the owner sees a description
     only inside the edit form. Show it rendered the way guests see it.
     How long ones are shown (in full or clamped) is decided in the
     mockup.
   - **Gift details, hidden until the owner reveals them.** The owner
     wants them for thank-you notes, for matching Venmo/Zelle payments to
     pledges, and for the fun of watching when they don't mind spoilers.
     Under each gift: purchases (guest name, units, message, date) and
     pledges (guest name, amount, date, and the payment method once item
     3a records it). Active holds (name, units, expiry)
     can show too.
     - A "Show who gave what" control with a short spoiler warning
       reveals them. **Hidden hides only who and what they said:** counts
       and progress ("1 of 2 bought", "$40 of $120 pledged") always
       show, so the owner sees what's still needed and the edit warnings
       keep their numbers.
     - *Builder's call:* the names and messages come from a separate
       owner-only request made on reveal, not in the manage view, so
       they never reach the browser (or the network tab) unrevealed.
       Whether the reveal is remembered in that browser is decided in the
       mockup.
     - ADR-0022 already says messages reach the owner straight away;
       this is the first place they show. The spec's spoiler settings
       (`ownerSeesClaimStatus`, `ownerSeesClaimerIdentity`, the reveal
       date, ADR-0020/0070) stay unbuilt; record the simpler on-demand
       reveal in a new or amended ADR.
     - Not now: marking a gift "thanked" (ADR-0021), and a list-wide
       view of all pledges for payment matching. Either can follow if
       per-gift details prove clumsy.
   - **Fewer buttons per gift** (owner's request). Today each gift shows
     Up, Down, Top, Bottom, Edit and Delete. ADR-0086 kept all four move
     buttons visible because a menu made a jump take two taps; a drag
     handle changes that trade-off. Candidates for the mockup: a handle
     plus one "⋯" menu (Move to top, Move to bottom, Edit, Delete); or an
     "Arrange" mode that shows the move controls only while reordering.
     Whatever is chosen keeps a non-drag way to move a gift for keyboard
     and screen-reader users.
3a. **Edit the Venmo and Zelle handles, and record each pledge's method**
   (owner's request; ~6–9 PRs plus ADR amendments). Handles are set at list creation and can't be
   changed (ADR-0082 deferred the settings UI). Add them to the list
   details the owner already edits; amend ADR-0082. Clearing both stays
   refused while the list has a group gift, as at creation.
   - Today a pledge doesn't record which method the guest chose: the
     contribute dialog lets the guest pick Venmo or Zelle but doesn't send
     it. Once handles can change, an older pledge can't say where it was
     paid. **Each new pledge records the method the guest picked and the
     handle it showed them** (ADR-0045's snapshot, as planned): a new
     migration, the contribute request carrying the method, and the
     snapshot shown in item 3's pledge details ("$40 via Venmo to
     @handle"). Pledges made before this show "method not recorded".
     Recording the snapshot lands before handle editing, so no pledge
     made after editing exists is ever missing it.
4. **Drag-and-drop reordering, phones included** (~5–7 PRs plus an ADR
   amendment). Amend ADR-0086, which left drag-and-drop out. Where the
   handle sits comes from item 3's mockup.
   - Dragging works on phones and desktops through a drag handle on each
     gift, so it doesn't fight page scrolling. This adds a library (such
     as dnd-kit) that also gives keyboard dragging. Touch is covered by an
     e2e journey.
   - A drop lands at any position, which the current up/down/top/bottom
     move command can't express, so this probably adds a "move to
     position N" move to the domain, route and contract, one PR each.
5. **Static demo** (~6–8 PRs plus an ADR amendment). Details below.
6. **README and CONTRIBUTING for newcomers** (2 docs PRs). The README
   leads with the demo link and the self-hosting steps; development notes
   move to CONTRIBUTING. CONTRIBUTING gets shorter and starts with what a
   newcomer does first. Keep the README's "early development" note and
   the wording the owner settled for it in the last README refresh.

The demo goes live at the end of Gate 1, before Gate 2 is done, with the
"early development" note kept.

### The static demo (chosen approach)

**Approaches considered:**

- **A. Real use cases in the browser (chosen).** A demo build of the web
  app replaces the `fetch` behind `apps/web/src/api/client.ts` with a small
  in-browser router that calls the real application use cases, backed by
  the existing in-memory repositories. The demo can't drift from the real
  rules.
- **B. A hand-written mock API (MSW handlers with their own state).**
  Smaller up front, but it copies every rule (hold limits, contribution
  caps, buy and undo) and would drift from what self-hosters get.
- **C. A hosted real instance reset nightly.** Not static, and it
  reintroduces the hosting load ADR-0041 deferred over. Running the whole
  Node server in the browser (WebContainers) is also out: heavy on phones,
  and under licence terms.

**What the visitor gets:** one seeded sample list, viewable as the owner
or as a guest through a visible switch. Changes persist in the visitor's
browser (`localStorage`) until they press "Reset demo". Nothing leaves the
browser. Switching to the owner after acting as a guest shows the effect
straight away: after item 3 the manage page shows bought and pledged
counts at once, and "Show who gave what" reveals the visitor's own guest
name and message. The page says plainly that it is a demo and that data stays on
this device. It is not indexed (`noindex`). There is no list creation.

**What it touches:**

- The domain and application layers have no Node-only imports (the one
  `node:crypto` use is in a test fake), so they bundle for the browser.
  A demo `Hasher` and `TokenGenerator` need browser implementations; the
  `Hasher` port is synchronous, so the demo can use a plain non-secret
  hash (the demo holds no secrets).
- The in-browser router replaces what the Fastify routes in
  `apps/api/src/presentation/` do for each request the web app makes:
  request shaping, error mapping to the same status and code, and who is
  the owner and who is a guest (the owner token and guest key are
  pre-filled by the role switch). This is the largest part. Where a route
  handler's logic can be shared instead of copied, share it.
- Persistence: serialise the in-memory store to `localStorage` after each
  command; load it on start; fall back to the seed if it is missing or
  unreadable.
- Hosting: a GitHub Pages deploy from a workflow. *Builder's call:* it
  deploys on release tags (plus a manual trigger), not every push to
  `main`, so the demo matches what self-hosters install.
- The web app's ESLint boundary rules may forbid importing the API's
  application layer; the demo build needs an allowed path for it.
- **ADR-0041** is amended from "deferred" to "a static, client-only demo".
  The demo requirements in `docs/spec/governance-licensing-and-release.md`
  change with it: the nightly reset becomes a per-browser reset button,
  and rate limits don't apply because there is no server.

**Left to the builder:** the router's structure, the seed list's contents,
the switch's look (in the Storybook/Groovy styles already in the app),
the Pages workflow and the demo's base path.

## Gate 2: before the project is announced

Things a stranger running their own instance would hit.

7. **A prebuilt image** (~2 PRs). Build and push a multi-arch
   (arm64 for Raspberry Pis, plus amd64) image to GitHub's container
   registry on each release tag. `docker-compose.prod.yml` and
   `docs/deploy.md` then use the image instead of building from source.
   Revisit `NODE_ENV` in the runtime image, which was deliberately left
   for this moment.
8. **Backup and restore steps** (~1–2 PRs). `docs/deploy.md` has none.
   ADR-0031 already chose `VACUUM INTO`; document it, possibly with a
   script, and the restore path ADR-0032 relies on.
9. **Abuse limits** (own design, ~5–8 PRs). Rate limiting on guest-key and
   create-secret attempts (ADR-0040), which needs `TRUSTED_PROXY_HOPS` to
   be read (nothing reads it yet), and the per-guest active hold cap
   (ADR-0046). All three are accepted and unbuilt.

## After launch

Not scheduled. Each item comes back through its own design.

- One owner or guest cookie per list instead of per browser.
- The purchase → buy rename, including "holding" → "claiming" in code
  names.
- The owner releasing a guest's hold (accepted, unbuilt).
- Deleting a whole list and the periodic purge (ADR-0033, ADR-0063); the
  privacy page says honestly that nothing is deleted automatically yet.
- Owner-uploaded gift pictures (planned and parked).
- **Usage and error metrics** (tabled by the owner). Three layers were
  explored: free signals with no code (image pull counts, GitHub stars and
  traffic); the designed but unbuilt per-instance `/metrics` page for each
  operator (ADR-0030, `METRICS_ENABLED`); and an opt-in weekly usage report
  to a maintainer-run collector with a public stats page, modelled on
  Syncthing's. If revived: the report is off by default, the operator can
  view it before it is sent, it carries no names, list contents or IP
  addresses, and it needs an ADR because it breaks the
  no-outbound-requests principle. Whether errors need counts or full
  debugging detail (stack traces, which can carry guest data) was left
  open.
- Code-health follow-ups that visitors can't see: `Item` storing a
  `Money`; access checks moving onto `Wishlist`; deciding which layer owns
  ADR-0016's "fail the same way"; an owner-cookie generation for token
  rotation; `GuestKey` trimming; typed MSW fakes in older web tests; a
  shared no-await helper for the hold hooks; the footer instance query's
  ~35 s of retries.

## Decisions

Made by the owner in this conversation:

- Self-hosting is the aim; the demo is how people try it first.
- The demo shows both sides of one seeded list (approach A).
- CI and drag-and-drop come early, in Gate 1.
- The repo is already public; no history rewrite.
- Drag-and-drop works on phones, and the item's design looks at showing
  fewer buttons per gift.
- The owner can edit the Venmo and Zelle handles, and each new pledge
  records the method and handle the guest used.
- The manage page shows gift details (purchases, pledges, names,
  messages) for thank-you notes, payment matching and curiosity. They're
  hidden until the owner reveals them, and hiding covers only who and
  what they said; counts always show.

Calls made in this roadmap, for the owner to check:

- Descriptions, gift details, fewer buttons and the drag handle share one
  manage-page design and mockup.
- Handle editing and the per-pledge method snapshot ship as one item,
  snapshot first.
- Gift names and messages load only on reveal, from their own request.
- No "thanked" marking and no list-wide pledge view for now.
- The demo goes live at the end of Gate 1, before abuse limits and the
  prebuilt image.
- Drag-and-drop adds a "move to position" command rather than being built
  from repeated up/down moves.
- CI's checks become required on `main` and the private pre-push gate
  retires; `verify.sh` before pushing is recommended, not enforced.
- The demo deploys on release tags, not every push to `main`.
- The README in Gate 1 still tells people to build from source; it switches
  to the prebuilt image when Gate 2's image lands.
