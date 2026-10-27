# Guest feedback round — design

Date: 2026-10-26 · Owner: dtbiedrzycki · Target: 1–3 days of work

## Why

The owner tested `main` (20be8de) as a guest would and found the gaps
that would stop a real guest: nobody explains holds or that a hold must be
marked purchased, the key screen doesn't say where the guest is, the guest
key is 32 random characters nobody can type from a printed card, and
nothing says what Gubbins is or links to its source. The project is also
about to go public on GitHub.

Success: a guest who has never heard of Gubbins can open an invite, get
in, understand holding, buy a gift and mark it purchased without help.

Mockups (Storybook look, phone width, owner-approved 2026-10-26):
[`docs/design/guest-feedback-mockups.html`](../../design/guest-feedback-mockups.html)
— guest list, key screen, hold dialog, Zelle, home page, owner
create/ready. Open it after `npm ci` so the self-hosted fonts load.

## Goals, in priority order

### Must have

1. **Holding explained.** On the guest list, under the header, a
   "How holding a gift works" box (a `<details>`, open on a guest's first visit on this device and
   closed after, remembered in localStorage), three
   numbered steps. It shows only while at least one single gift is
   available to hold: a list of group funds, or one with every single gift
   taken, has no box (a guest with a hold saw it when they held). The box replaces the one-line hold sentence under the
   list title:
   1. **Hold it before you buy it.** Other guests see it's taken, so
      nobody buys it twice.
   2. **Buy it within N days.** The hold is yours until then, and you can
      extend it once.
   3. **Come back and mark it purchased.** If you don't, the hold ends
      after N days and another guest can buy the same gift.

   N is `capabilities.holdDurationDays`. Step 2 always says the hold can
   be extended once (ADR-0002). The hold dialog adds a
   boxed note: "After you buy it, come back and tap 'Mark as purchased'.
   If you don't, the hold ends after N days and another guest could buy
   it too." and its subtitle becomes "Other guests will see it's taken
   while you buy it."
   So that a guest can actually come back: the guest session cookie gets
   a 30-day `maxAge` (today it has none and dies with the browser, which
   drops the guest's holds from "Your holds", since re-entering the key
   mints a new session). 30 days outlasts a hold plus its extension with
   room to spare; one-line why in code. The owner-access cookie is
   unchanged. The privacy page mentions the cookie's 30-day life.
   Same browser only: the private hold link (`/{slug}/hold/{holdSecret}`)
   for other devices is a later round.
2. **Key screen says where you are.** Keep "Knock, knock." Add: "You've
   found a **gift list** someone shared with you. It runs on Gubbins, a
   small wishlist app with no accounts, no ads and no tracking." then
   "Enter the guest key from your invite to see what they're hoping for."
   Under the field: "The list owner sent it with your invite: three words
   joined by dashes." Placeholder `maple-lantern-otter`. The field gets
   `autocapitalize="none"`, `autocorrect="off"`, `spellcheck={false}`,
   `autocomplete="off"`. The generic not-found error (ADR-016/054) is
   unchanged.
3. **Human-readable guest key.** New lists get three lowercase words
   joined by `-`, drawn uniformly with `crypto.randomInt` from the EFF
   large wordlist (7,776 words, ~38.8 bits), minus any entry containing
   a hyphen or other non-letter, so every key is exactly three words
   joined by dashes (owner-approved). The filtering happens in code; the
   vendored file stays verbatim, so the attribution needs no "modified"
   note. The wordlist and the drawing live in infrastructure beside `TokenGeneratorCrypto`;
   `TokenGenerator.generateGuestKey()` still returns a string the domain
   wraps (settled). `GuestKey` gets a maximum
   length of **32** characters, enforced in `GuestKey.from`, so a
   generated key is checked before it is stored or shown (`Wishlist.create`
   already goes through `GuestKey.from`). 32 fits both formats: old keys
   are exactly 32 base64url characters and three EFF words are at most
   3 × 9 + 2 = 29. A test pins that the longest word in the list keeps a
   key within the maximum. Existing keys keep working (stored plain,
   ADR-0052). A typed candidate longer than 32 simply fails to match and
   gets the generic not-found response, never a distinct validation error.
   The owner token and hold secret do not change.
4. **Footer** on every page (home, create, key screen, list, manage,
   privacy): one centered line, "Gubbins is free software under the
   AGPL-3.0 · Source on GitHub · Privacy". AGPL-3.0 links to
   `https://www.gnu.org/licenses/agpl-3.0.html`; "Source on GitHub" links
   to `SOURCE_URL` (ADR-0043), defaulting to
   `https://github.com/dtbiedrzycki/gubbins` when unset; "Privacy" links
   to `/privacy`. The URL must come from the server at runtime, not be
   baked in at build time, because the Docker image is built once and
   configured by env (ADR-0043). It must be available before key entry.
5. **Public repo with `main` protected.** Before flipping visibility:
   scan the full git history for secrets and for personal data in commit
   metadata, and report findings to the owner. If anything is found,
   stop: the repo stays private, and any history rewrite is the owner's
   call, run by the owner (auto mode cannot), before the ruleset and the
   flip. Feature work does not wait on it. The owner approves the flip. Protection on `main`: changes only through pull requests, no
   force pushes, no deletion. No required approvals (single maintainer)
   and no required status checks (GitHub CI is disabled; `verify.sh` is
   the gate). The owner and actors authorised by the owner (e.g. the
   DevBot, which pushes with the owner's token) may merge; nobody else
   has write access. Apply the ruleset before going public if the plan
   allows it on a private repo; otherwise immediately after.

### Good to have

6. **Filter items** by status: buttons "All · n", "Available · n",
   "Held · n" (small wax seal), "Purchased or funded · n" (small gold
   seal). No seal on All or Available: a seal means something happened to
   the gift. Single-select, `aria-pressed`, client-side over the loaded
   list. A group gift counts as funded once `pledgedMinor >= priceMinor`;
   until then it is Available. Default All.
7. **Descriptions, markdown, on lists and items.** One optional
   description on the list ("About this list") and one on every item
   type. The list description is where an owner puts a shipping address
   (ADR-0005 already says so; the form hint says it too). Both are set
   only at creation: lists and items have no edit flow and this round
   adds none; the form hint says it can't be changed later. Rendering:
   - paragraphs, line breaks (a single newline is a line break, so an
     address typed one line per row stays that way), bold, italic, ordered/unordered lists and
     links; `http`/`https` URLs only, bare URLs become links (GFM
     autolink); links open in a new tab with
     `rel="noopener noreferrer nofollow ugc"`
   - no images (they would load from a third party and leak guest IPs,
     against `docs/spec/privacy.md`), no raw HTML, no headings, tables or
     code blocks beyond rendering as plain text; any other scheme
     (`javascript:`, `data:`) is dropped
   - rendered without `dangerouslySetInnerHTML`
   - clamped to 2 lines with a "Show more" / "Show less" button
     (`aria-expanded`), shown only when the text overflows
8. **Choose Venmo or Zelle, with Zelle steps.** In the contribute
   dialog's pay step, when the list has both handles, a two-option switch
   "Venmo | Zelle" (a radio group labelled "Pay with") shows one method's
   panel at a time; with one handle, that panel shows alone and there is
   no switch. Name, message and "I've sent it" stay below, whichever is
   chosen.
   - **Venmo panel:** the existing "Pay $X with Venmo" link (the link
     itself is unchanged), then "Opens Venmo with the payment information
     pre-filled." No specifics: the note doesn't reach Venmo's mobile app.
   - **Zelle panel:** three steps: open your bank's app and choose Send
     money with Zelle; send the amount to the handle below (with the
     existing Copy button); add the gift name as the memo.
   - **Default and memory:** Venmo is selected first. The guest's choice
     is remembered in this browser's `localStorage` (one key for the app,
     not per list), read and written inside try/catch so a blocked store
     just means Venmo again. A remembered method the list doesn't offer
     falls back to the one it does.
9. **Home page** at `/`: "Gubbins — A wishlist that respects the people
   using it.", one sentence on what it does, then four points: "No
   tracking." ("No accounts, no profiles, and nothing that follows you
   around the web."); no ads;
   self-hostable (runs on a Raspberry Pi); open source under the AGPL v3.
   Then "Got an invite? Open the link from it." No create link: list
   creation needs the create secret (ADR-0080). The create form moves
   to `/wishlists/new` (see Routes); update every reference (e2e, docs,
   README, the links on the create page).
10. **Privacy page** at `/privacy`: plain statement of what the app does
    *today*: what it collects from guests (name, optional message,
    pledge amounts, a strictly necessary session cookie), who sees names
    (only the list owner), that guests are not tracked as individuals
    (no profiles, no third-party trackers or scripts; fonts are
    self-hosted), that no ads are served, and when data is deleted — only as far as
    the code actually deletes it now. If `PRIVACY_CONTACT` is set, show
    it as the contact; otherwise say to contact whoever runs this site.
    This is the interim notice; ADR-0056's full per-list notice remains
    the later target.

11. **Images only from Gubbins itself.** Every response carries
    `Content-Security-Policy: img-src 'self'`, so a browser refuses any
    image from another host even if a future bug let one into the page.
    This backs up the markdown rules in goal 7; it is not the strict CSP
    `docs/spec/privacy.md` calls for, which stays later work. Check the
    built SPA still renders (no `data:` or remote images in use today).

### Routes (owner ruling, 2026-10-26)

Page routes follow resource naming:

| Page | Route |
|---|---|
| Home | `/` |
| Privacy | `/privacy` |
| Create a list | `/wishlists/new` |
| Guest list (key screen until a key is entered) | `/wishlists/:slug` |
| Owner page | `/wishlists/:slug/manage` |
| Old `/:slug` and `/:slug/manage` | client-side redirect to the new path, keeping the `#` fragment (the guest key, ADR-0067) |

The redirects keep invites and bookmarks already handed out working;
remove them once no old invites are in use. Later pages follow the same
shape: `/wishlists/:slug/holds/:holdSecret`, `/wishlists/:slug/my-data`;
update `docs/spec` where it names the old paths. `manage` stays a
separate page this round. The target, for the owner dashboard round, is
one address `/wishlists/:slug` whose content depends on the access
context, owner view winning when both sessions exist (so an owner opening
their own invite sees no spoilers, ADR-0020); it needs an owner list view
the API does not have yet. API paths stay `/api/lists/...`.

### Input handling (one ruling, 2026-10-26)

| Field | Trim | Max | Empty | Owner of the rule |
|---|---|---|---|---|
| List description | ends only; inner newlines kept | 2,000 chars | stored as null | `Wishlist` domain; create form mirrors it with the existing `LimitedTextarea` counter |
| Item description | ends only; inner newlines kept | 1,000 chars | stored as null | `Item` domain; add-item form mirrors it |
| Guest key (stored/generated) | ends (as today) | 32 chars | error | `GuestKey.from` |
| Guest key (typed on the gate) | ends (as today) | over 32 ⇒ no match | required | `GuestKey.matches`; generic not-found |

Both description limits are enforced in the entity's private constructor,
like the title, so `reconstitute()` checks them too. Each limit gets a
one-line why in code: 2,000 leaves room for a greeting, a shipping
address and a few links; 1,000 for an item's size, colour and store notes.

The "funded" grouping in the filter is presentation over fields the list
view already returns (`pledgedMinor`, `priceMinor`); item status itself
still comes from the server.

No DB length CHECKs (standing ruling). No case folding of keys: old keys
are case-sensitive; new ones are generated lowercase.

## Non-goals

- Editing a list or item after creation.
- Rate limiting (ADR-0040, unbuilt). Accepted risk: with ~38.8 bits and
  the list URL known, an unthrottled attacker averages ~75 years at 100
  guesses/s, ~7.5 years at 1,000/s, ~9 months at 10,000/s. The attempt
  itself is a denial of service; rate limiting is the next follow-up.
- Venmo mobile-app deep link: leave as is (owner ruling).
- Cash / pay-in-person: deferred.
- A dedicated shipping-address field: rejected; ADR-0005 stands.
- Rotating existing lists' keys to words.
- The private hold link and any cross-device return path.
- Renaming API paths from `/api/lists` to `/api/wishlists`.
- Merging the owner page into `/wishlists/:slug`.

Wording rule for both pages: promise no tracking of people and no ads,
never "no analytics" or "no metrics": anonymous aggregate counts may
come later (owner, 2026-10-26).

## Anti-goals

- Anything that makes a guest's browser contact a third party
  (images in markdown, CDN fonts, analytics).
- Jokes in button labels or status wording; "held" stays "held".
- A green or "available" seal.

## Constraints

- Every PR ≤ 10 changed files; ≤ 8 stacked PRs open (skill `small-prs`).
- `verify.sh` is the gate (`--e2e` for PRs targeting main); GitHub CI is
  disabled.
- Peer sessions share `/workspace`: implement in worktrees.
- Migrations are forward-only (ADR-0032). Descriptions are CRUD columns
  (ADR-0007), not ledger events.
- WCAG 2.2 AA (ADR-0023): 44 px targets, real buttons, contrast.
- Tests at the owning layer, one per rule (skill
  `testing-at-the-owning-layer`); no plan identifiers in test names.
- ADRs may be amended in place before release: amend ADR-0052 (or the
  threat-model summary) with the word-key entropy and the rate-limit
  dependency; add the EFF wordlist's CC BY 3.0 US attribution.

## Left to the builder

- Markdown library and configuration (e.g. `react-markdown` +
  `remark-gfm` with an element allowlist and URL transform), as long as
  the rendering rules above hold and it adds at most three dependencies
  (renderer, GFM, line breaks).
- How the runtime instance config (`SOURCE_URL`, `PRIVACY_CONTACT`)
  reaches the SPA: a small public endpoint or server-side injection into
  `index.html`. It must not require a guest session.
- Where the footer lives (a shared layout route vs. per page).
- Exact PR boundaries, within the priority order above.
