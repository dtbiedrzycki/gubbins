# Guests get in, and errors are recoverable — design

## Why

The production instance is about to get its first guests. A read-only review of `main` (6aa491e6) found no guest-triggerable 500 on the normal path and no unsafe concurrency (SQLite, one connection, `begin immediate`), but it did find ways a real guest loses access to their holds, gets stuck in a dialog, or is told the wrong thing when the network or server hiccups.

Who the first guests are (owner, 2026-11-12):

- They get an **invite link by email** and open it **on a phone**, usually on mobile data or someone else's wifi.
- Each guest is invited to **one list**.
- They come back over days or weeks: look, hold, go buy, return to mark it purchased. Some chip in through Venmo or Zelle and come back from that app.

Success: a guest taps the email link and is on the list without typing anything; a flaky connection or a deploy never strands them in a dialog or on a crash page; every error tells them what to do next; a guest who comes back weeks later can still finish what they started.

## Goals

1. **Key in the link.** Build ADR-0067 (accepted, never built): invite links carry the key in the fragment, the list page signs the guest in from it.
2. **Sessions outlive the guest's holds.** The session cookie is renewed on use, and one list's session never replaces another's.
3. **Typed keys forgive phone keyboards.** Capitals and spaces in a typed word key are accepted.
4. **No stuck dialogs.** Offline or a request that never answers ends in an error the guest can act on.
5. **Honest, actionable error text** on every guest screen, including the key screen.
6. **No crash page** after a deploy or on a bad URL.
7. **Retrying an action that already worked looks like success**, and the purchase sheet never throws away the guest's message on a retryable failure.
8. **A chip-in survives a trip to Venmo.**
9. **Small hygiene:** fix the deploy doc's `down -v` advice, add the missing items index, stop loading the whole list twice per guest request.

## Non-goals

- **Per-session hold cap (ADR-0046) and owner release of a guest's hold.** Accepted ADR, not built; the owner left it out of this round.
- **Rate limiting.** Deferred by an earlier owner ruling.
- Logging the route pattern instead of `request.url`, the lone-surrogate idempotency key, aborted-upload 500s, the "Try a smaller amount" locked box, the "more units than free" wording, the long Zelle handle on 320 px. Low; not in this round.
- Server-side idempotency for extend, release or purchase. The client handles "already done" (Goal 7); the API contract does not change for it.
- Any change to what the guest sees once on the list beyond error text and the dialogs named below.

## Anti-goals

- **The key ever reaching a server in a URL**, an access log, or our own logs. It travels only as the POST body to the existing session endpoint (ADR-0067).
- **Telling "no such list" from "wrong key"** anywhere (ADR-0016/0054). Network and server failures may be distinguished from not-found; the two not-found causes may not be told apart.
- **Silent retries of writes.** A timed-out POST is reported as "may not have gone through", never re-sent automatically.
- **A schema change that is not a new migration.** The production DB is live.

## Guest experience

### Opening the invite link

- Invite link shape: `https://<host>/wishlists/{slug}#key={key}`. The key is URL-encoded in the fragment.
- On load of the list page, if the fragment has `key`:
  1. Remove it from the address bar at once with `history.replaceState` (keep path and any other fragment content; there is none today).
  2. If the guest already has a valid session for this list (the list view loads), ignore the fragment key.
  3. Otherwise POST it to `POST /api/lists/{slug}/session`, exactly as the key form does, and on success show the list.
  4. If that POST returns 404 (wrong or rotated key, or no such list), show the normal key screen with the fragment key **prefilled** and the usual "This list could not be found." message.
  5. If it fails for network or server reasons, show the key screen prefilled, with the network/server message (below), so "View list" retries it.
- While steps 2–3 run, show the same loading state the list page already uses, not the key screen.
- The browser-history residual risk ADR-0067 discloses is accepted as is.

### Invite card (owner side)

- `lib/InvitationCard.tsx` shows **one link with the key in it** and one "Copy link" button. The separate key line and "Copy key" button go (owner, 2026-11-12: a key sent separately will be very rare).
- Used on the create-list ready screen and the manage page's list details; both change.
- The heading copy changes to suit a single link (builder's wording, e.g. "Send guests this link").
- Typing the key on the list page stays as the fallback, and the key screen's hint text stays.

### Typing the key

Input handling for the key, applied **server-side** in `GuestKey.matches` (the web keeps only its existing trim), and only when the stored key is a word key (three lowercase words joined by `-`, which is every key `isGuestKey` accepts today). A stored key of any other shape (older base64url keys, if any exist in production) keeps exact, trimmed matching.

| Typed (stored `maple-lantern-otter`) | Result |
|---|---|
| `maple-lantern-otter` | accepted |
| `  maple-lantern-otter  ` | accepted (trimmed, as today) |
| `Maple-Lantern-Otter`, `MAPLE-LANTERN-OTTER` | accepted (lowercased) |
| `maple lantern otter`, `maple  lantern   otter` | accepted (runs of whitespace become `-`) |
| `maple - lantern - otter`, `maple--lantern-otter` | accepted (runs of whitespace and dashes become one `-`) |
| `maple_lantern_otter`, `maple.lantern.otter` | refused (only whitespace and dashes are separators) |
| `maplelanternotter` | refused |
| `maple-lantern` | refused |
| a key of any length that doesn't match | the generic 404, as today (an over-long typed key is just a wrong key; `EnterGuestKey.test.ts` already pins this) |

Normalise first, then compare; no length check on the typed candidate (a spaced-out key can be longer than its normalised form). The comparison stays constant-time on the normalised candidate. (My call: keeping the 404 rather than adding a 400.)

### Sessions

- **Renewal:** every request that `guestAccess` accepts re-sets the guest session cookie with a fresh 30-day `maxAge` and the same payload. A guest who keeps visiting never loses their session; one who stays away for 30 days does (unchanged).
- **One cookie per list:** a guest's session for list A is never replaced by entering list B's key. The same for the owner cookie. Builder's choice of mechanism (cookie `path` scoped to `/api/lists/{slug}`, or the list in the cookie name); either must keep `HttpOnly`, `Secure`, `SameSite=Strict`, signing, and the generic 404 for a missing or foreign session.
- **Existing cookies:** production has no guests yet, so old `path: '/'` cookies need no migration; a stale one simply stops being accepted and the guest re-enters the key (or re-taps the link). The owner re-enters their token once after deploy. Say so in the PR description.

### Network failures and timeouts (web)

- The query client runs queries and mutations with `networkMode: 'always'`, so offline fails fast instead of pausing.
- Every API request has a **15-second timeout**; a timeout is the same `ApiError` with status 0 that a network failure already is (`isNetworkFailure`).
- Any dialog whose request fails this way leaves its pending state, re-enables Cancel and shows the offline message.

### Error text on guest screens

One shared function decides guest-facing error text (move `features/manage/actionErrorMessage.ts` to `lib/` and use it on both sides; keep its tests). Rules, in order:

| Failure | Text |
|---|---|
| status 0 (offline, timeout) | "‹couldn't…› You seem to be offline. Check your connection, then try again." (existing) |
| status ≥ 500, or not an `ApiError` (includes a proxy's HTML error page) | "‹couldn't…› Something went wrong on our end. Wait a moment, then try again." (existing) |
| 404 on a hold, purchase or contribute action | "‹couldn't…› Reload the page to see the list as it is now." (new) |
| 400 with no domain message (the generic "Invalid request") | the 5xx text (the guest can't fix a malformed request) |
| any other 4xx | the server's message (the domain's own wording, as today) |

Applies to: `ListPage` error view, `HoldDialog`, `PurchaseDialog`, `ContributeDialog`, `HoldActions` outcomes, `YourContributions` actions. The "‹couldn't…›" lead-in is per screen (builder's wording, short).

**Key screen** (`GuestKeyGate`): 404 keeps "This list could not be found."; status 0, ≥ 500, a non-`ApiError` and any other status use the offline / our-end text with lead-in "Couldn't check the key."

**List page 404** keeps today's behaviour: a 404 on the list view itself (first load or any refetch) means the session is gone, and the page swaps to the key screen, as `ListPage`'s `sessionGone` does now. Only its non-404 error view uses the table above. (My call.)

After a key is accepted the "View list" button stays disabled ("Opening…") until the list has loaded.

### Crash page

- The router gets a root `errorElement`: the site's normal header/footer frame, "Something went wrong.", and a "Reload" button. No error text or stack is shown.
- A catch-all route (`*`) shows a plain not-found page with a link home.
- A failed lazy-chunk import (the tab predates a deploy) **reloads the page once** automatically; a second failure in the same tab session shows the error element. Guard the "once" with `sessionStorage`, wrapped in try/catch.
- The API returns **404** for a missing `/assets/*` file instead of `index.html`, so a stale chunk fails as a missing script, not as HTML parsed as JavaScript.

### Retrying an action that already worked

`main` already treats a lost purchase answer as success when the refetch shows the hold purchased. Extend the same rule:

- **Purchase:** a 409 `hold_not_active` whose refetch shows this hold `purchased` → success message.
- **Extend:** a 409 "already extended" → refetch; if the hold is extended → the normal extended outcome.
- **Release:** a 404 or 409 `hold_not_active` after release → refetch; if the hold is gone from `myHolds` → the normal released outcome.
- Otherwise the error text table above applies.

### Purchase sheet keeps the message

The sheet stays open, with the typed message and unit count, for: status 0, status ≥ 500 or non-`ApiError`, a 409 without a `code` (concurrency clash), and `item_unavailable` (as today). It closes only when the refetch shows nothing left to buy (existing behaviour) or for `hold_not_active` / 404 (after the retry rule above).

### Chip-in survives Venmo

- The guest may come back either way (owner, 2026-11-12): by switching back to the same tab, or by re-tapping the email link, which opens a new tab or in-app browser. So the draft goes in `localStorage`, keyed per list, not `sessionStorage`.
- While the contribute dialog is open, save the draft: item id, step, amount text, message, the pledge's idempotency key, and when it was saved. Wrap every read and write in try/catch; without storage it behaves as today.
- A draft older than **24 hours** is ignored and removed (my call). One draft per list; a new chip-in replaces it.
- On loading the list page, if a draft exists for an item that is still on the list and still open for contributions, reopen the contribute dialog at the saved step with the saved values.
- Clear the draft when the pledge succeeds (including a replay), when the guest cancels, or when the item is gone or closed to contributions.
- If two tabs have the same list open, the one that loads the list last reopens the draft; finishing it in either tab clears it. No cross-tab syncing.
- Reusing the saved idempotency key means a pledge that did go through before the tab was dropped is replayed, not doubled.

## Server and data hygiene

- **`docs/deploy.md`, Upgrading:** delete the "Until go-live … `down -v`" paragraph. Say: upgrading is `up -d --build`; migrations run at start-up; never run `down -v` on production. Also say to stop the server before running the `migrate` or `rebuild-projections` scripts against the live database.
- **Migration `0003`:** `create index items_wishlist_position on items(wishlist_id, position)`. New file; `0001`/`0002` untouched. `assertSchemaMatches` compares columns only, so it is unaffected; check that.
- **Narrow slug lookup:** `guestAccess` and `ownerAccess` get the list's `id` and `keyGen` from a lookup that selects only those columns by slug, instead of `findBySlug` loading every item, hold and pledge. Use cases then load the list once, as they already do.

## Constraints

- PRs of 10 files or fewer, each through two review rounds before opening, `verify.sh --e2e` before targeting `main` (repo rules).
- Tests at the owning layer: key normalisation in the `GuestKey` domain test, cookie renewal/scoping in routes integration tests, error text in the shared function's unit test, dialog behaviour in component tests, fragment entry and the crash page each in one e2e or component test (builder's choice of layer per the skill).
- No new dependencies.
- The e2e specs read the key from the invite card's `data-testid="guest-key"`, which goes away; they take the key from the link's fragment instead (or open the link directly).
- OpenAPI contract unchanged except if the cookie mechanism needs a documented change.

## Decided by the owner

- Build the key-in-fragment link now; the invite card shows only that link (2026-11-12).
- Scope: everything in Goals; the hold cap and owner release of holds are out.
- The chip-in draft survives both switching back to the tab and re-tapping the invite link (2026-11-12).

## Calls made in this design (check these)

- The 15-second timeout.
- The fragment key is prefilled on the key screen when it fails, rather than discarded.
- Separators accepted when typing a key: whitespace and dashes only.
- Retry-already-worked handled in the client, not the API.
- The chunk-failure auto-reload is limited to once per tab session.
- The chip-in draft expires after 24 hours.
- A generic 400 shows the "our end" text.

## Left to the builder

- Cookie scoping mechanism (path or name), within the constraints above.
- Exact wording of lead-ins, the crash page and the not-found page, in the site's existing voice.
- PR grouping and order (writing-plans).
