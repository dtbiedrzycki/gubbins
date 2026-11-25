# Editable payment handles and each pledge's method — design

- **Date:** 2026-11-24
- **Status:** Approved by the owner (2026-11-25)
- **Roadmap:** Gate 1 item 3a of `2026-11-19-open-source-roadmap-design.md`

## Why

Venmo and Zelle handles are set when a list is created and can't be changed
(ADR-0082). A typo needs a database fix, and an owner who changes accounts
mid-list is stuck. The owner wants to edit them.

Once handles can change, a pledge has to say where the guest was told to
pay. Today it doesn't: the contribute dialog lets the guest pick Venmo or
Zelle but never sends the choice. The owner matches Venmo and Zelle
payments to pledges in the gift details (ADR-0089), and needs to know which
account to look in, including for pledges made before a change.

A handle is the owner's personal data. It should be as easy to find and
erase as a guest's name, and an owner who changes a handle doesn't expect
the old one to be kept unless a pledge needs it.

Success: the owner fixes a handle from the manage page, and every pledge
made from then on shows "$40 via Venmo to @handle" in the gift details,
correct even if the handle changed while the guest was paying.

## Goals

- Each new pledge records the method the guest picked and the handle the
  dialog showed them (ADR-0045).
- The owner edits the Venmo and Zelle handles with the list details.
- Owner handles live in an `owner_pii` table, beside `guest_pii`, so
  personal data is found and erased in tables named for it.
- The gift details show each pledge's method and handle, flag one that is
  no longer the list's current handle, and say "method not recorded" for
  pledges made before this.
- A guest who is about to pay an old handle is told it changed.

## Non-goals

- Labels, instructions or other payment kinds (ADR-0044's wider model).
- Showing the method on the guest's own pledges.
- An erasure path for owner handles. This design keeps erasure a single
  update and leaves room for it; it doesn't build it.
- Proving a pledge's handle is one the list really had (see the rulings).

## Anti-goals

- **A guest who has paid loses their pledge.** The guest taps "I've sent
  it" after paying, so the server never refuses a pledge because the handle
  it names has changed.
- **Handle text in the immutable ledger.** Events carry only a reference,
  as `ItemHeld` and `ContributionPledged` already do for guest details
  (ADR-0057).
- **Keeping a handle nobody pledged to.** Changing a handle replaces it;
  only pledges keep a copy of the handle they named.

## Owner rulings (2026-11-24 and 25)

- **A pledge records what the guest reports: method and handle.** The
  whole pledge is the guest's word (the server can't check the amount, or
  that they paid at all), and the owner checks every pledge against their
  own accounts. So the handle is recorded as sent, after a format check,
  without proving the list ever had it. The dialog always sends the handle
  it displayed, so honest guests are recorded exactly. A hand-built request
  can record a handle that isn't the owner's; the owner sees a handle they
  don't recognise, as they would any false pledge.
- **Owner handles are owner PII in `owner_pii`**, the list's current
  handles included. `wishlists.venmo_handle` and `zelle_handle` go.
- **One `owner_pii` row per record**, like `guest_pii` (ADR-0057): the
  list's Venmo row, its Zelle row, and one row per pledge that named a
  handle. Pledge rows are never edited, only redacted on erasure.
- **Editing changes the list's row in place.** A changed handle replaces
  the old text (a capitalisation-only change included); a cleared handle
  deletes the list's row; a new one adds a row. Only pledges keep a copy of
  an old handle.
- **Never refuse a pledge for a stale handle.** A pledge whose handle isn't
  current is accepted and flagged to the owner.
- **The dialog says when the handle changed.** The handle shown is frozen
  when the pay step opens. If the list's current handle for that method
  changes (or goes) while the dialog is open, or before a saved draft
  reopens, the dialog says so, for example "The owner's Venmo changed from
  @old to @new since you started", and the guest chooses "I already paid
  @old" or pays the current handle. Either answer is recorded as the handle
  the guest actually paid.
- **Drafts keep their 24-hour life.** A draft is saved after the guest has
  seen the handle, so shortening it can't stop a wrong payment; it would
  only lose more paid pledges, Zelle through a bank app especially. The
  notices above are what prevent a payment to an old handle.
- **A gift removed while the guest is paying gets its own message**, in
  the open dialog and on a resumed draft (see Web).
- **A draft resumes for any group gift still on the list, funded or not.**
  Overfunding is allowed (ADR-0047), so a guest whose gift others finished
  funding while they paid can still record it. Today `ListPage` drops that
  draft silently.
- **Clearing both handles is refused while the list has a group gift.**
- **Handles are edited with the list details**, in the form the owner
  already uses for title, description and theme.
- **The pledge's method ships before handle editing**, so every pledge the
  dialog sends after an edit names its handle. (A tab loaded before the
  deploy can still send none; see the pledge request.)
- **`pii_ref` becomes `guest_pii_ref` first**, as its own short stack, so
  the new code reads `guest_pii_ref` beside `owner_pii_ref`. The event
  payload key `piiRef` stays: the ledger can't be edited, so `Item` (which
  builds the events) and `rebuildProjections` (which reads them) map it,
  each with a one-line comment. No new event version.

## Approaches considered

1. **What a pledge stores.** *Chosen:* its own `owner_pii` row with the
   method and handle the guest reported. *Rejected:* text columns on
   `contributions` (owner PII mixed into a ledger projection); a
   `pledge_payments` table (pays off only for several payments per
   pledge); the method alone with the handle read live (ADR-0045 rules it
   out).
2. **Whether to prove the handle.** *Chosen:* no proof, because the pledge
   itself is unproven. *Rejected:* pledges referencing shared, immutable
   handle rows, with unused rows deleted on edit and server-signed handles
   so a resumed draft can recreate a deleted one. It refused made-up
   handles but needed a signing key, signature expiry, row reuse for
   A → B → A, a changed guest contract and two or three more PRs, to guard
   a note only the owner sees. Also rejected along the way: keeping every
   handle row (keeps data the owner thinks is gone), a 24-hour timer (no
   scheduler), a keyed fingerprint of deleted handles (guessable by whoever
   holds the key), nulling unused rows (loses the handle on a resumed
   pledge), and owner confirmation of unknown handles (a new pledge state).
3. **Where the list's handles live.** *Chosen:* `owner_pii`, so all owner
   PII is in one table named for it. *Rejected:* keeping them on
   `wishlists` (cheaper; PII stays mixed with list settings).
4. **How the owner edits handles.** *Chosen:* two more fields on the
   list-details edit. *Rejected:* a separate payment request and form.

## The design

### Prerequisite: `pii_ref` → `guest_pii_ref`

A migration renames the column on `holds` and `contributions`. Code renames
`piiRef` to `guestPiiRef` through domain, use cases, ports, fakes,
repositories, contract suites and the rebuild. `piiRef` is in about 33
files and the `Contribution` field alone reaches about 16, so this follows
AGENTS.md's steps for a breaking change: add `guestPiiRef` beside `piiRef`,
move callers in batches within the 10-file cap, then remove `piiRef`.
Event types keep `piiRef`. A docs PR updates ADRs and specs (ADR text about
event payloads keeps `piiRef`), AGENTS.md and the review skill; past plans
stay as written.

### Data

Migration `0007` (after the rename's `0006`):

- `owner_pii`: `id` (UUIDv7), `wishlist_id`, `method` (`venmo` | `zelle`),
  `handle` (nullable, for erasure), `redacted_at`, `created_at`. No unique
  key: rows are per record.
- `wishlists`: `venmo_owner_pii_ref` and `zelle_owner_pii_ref`, nullable,
  replacing `venmo_handle` and `zelle_handle`. The migration copies each
  list's handles into `owner_pii` rows (minting UUIDv7 ids in JS), sets the
  refs and drops the old columns.
- `contributions`: `owner_pii_ref`, nullable (null for pledges made before
  this, or sent without a method), a foreign key to `owner_pii.id`. The
  pledge use case inserts the `owner_pii` row before the contribution, as
  it already does for `guest_pii`.
- CHECKs stay structural (ADR-0083): `method` in (`venmo`, `zelle`); no
  length CHECKs.

Erasure, when it is built, is one update: null `handle` and set
`redacted_at` on the list's rows whose handle matches (case-insensitively
for Venmo). The card then shows "via Venmo (handle removed)".

### Domain

- A `PaymentHandle` value object (`method`, `handle`) whose `from()` runs
  the per-method checks now inside `PaymentMethods`. A pledge's reported
  handle is one.
- `PaymentMethods` becomes the list's pair of current handles, each a
  `PaymentHandle` with the id of its `owner_pii` row, so there is one
  handle shape, not two. It answers whether a reported `PaymentHandle` is
  current for its method, ignoring case for Venmo (Venmo usernames are
  case-insensitive).
- The aggregate mints the row ids: `Wishlist.create` for the handles a
  list starts with, and `Wishlist.changePaymentMethods(venmo, zelle, ids)`
  for a handle added where there was none. A changed handle keeps its id
  (the repository updates the row); a cleared one drops it (the repository
  deletes the row). So the repository tells update, insert and delete
  apart by id.
- One private rule in `Wishlist`, "a list with a group gift needs a
  handle", serves both `addItem` and `changePaymentMethods`, and both throw
  the existing `NoPaymentMethodError` (409 `no_payment_method`). Its
  message changes to fit both: "Group gifts need a Venmo or Zelle handle
  on this list."
- `Contribution` gains `ownerPiiRef` (nullable). As with `guestPiiRef`,
  the pledge use case mints it beside the `owner_pii` insert (ADR-0057's
  exception), and `Wishlist.pledge` takes it.
- `ContributionPledged` gains an optional `ownerPiiRef` (still v1: older
  events lack it and read as "not recorded"), so a projection rebuild
  restores it from the ledger.

### Persistence

- An `OwnerPiiRepository` port, like `GuestPiiRepository`: insert a
  pledge's row, and find rows by ids for the gift details. A contract
  suite covers the real adapter and the fake.
- The wishlist repository reads the list's handles through its refs and
  writes edits to its rows: update in place, insert, or delete a cleared
  one.

### API

- **Guest list view:** unchanged.
- **Pledge request:** an optional `payment: { method, handle }`, `handle`
  capped at 254 like the other handle fields. Optional because a tab loaded
  before the deploy can still send "I've sent it"; missing means "method
  not recorded". A malformed handle is a 400; only a hand-built request can
  send one.
- **Gift details** (`GET …/contributions`): each pledge gains
  `payment: { method, handle: string | null, current: boolean } | null`.
  `handle` is null once erased.
- **Manage view:** gains `payment: { venmoHandle, zelleHandle }` so the
  edit form can show the current handles.
- **Edit list details:** gains `venmoHandle` and `zelleHandle`, both
  required and nullable, with `null` to clear, like `description`, and
  capped at 254 like the create request. An owner's tab loaded before the
  deploy sends neither and gets a 400 until it reloads; accepted, as with
  earlier required fields.

Each contract change is its own PR and regenerates the OpenAPI types
(ADR-0077).

### Errors

- Clearing both handles while the list has a group gift: the existing
  `NoPaymentMethodError`, 409 `no_payment_method`, with the message above.
- A malformed handle in either request: `DomainValidationError` 400 with
  its message.
- A pledge to a gift that no longer exists stays the generic 404; the
  dialog gives it its own message (see Web). An expired guest session is
  also a 404 (ADR-0016), so the dialog tells them apart by refetching the
  list, not by the status.

### Web

- **Contribute dialog:** freezes the method and handle when the pay step
  opens, so a list refetch (which happens when the guest returns from the
  Venmo app) doesn't swap them under the guest. "I've sent it" sends the
  frozen pair. If the guest switches method on the pay step, that method's
  current handle is frozen in its place. When a refetch shows a different
  current handle for the frozen method, the dialog shows the change notice
  and its two choices; choosing the current handle freezes it instead. If
  the method was removed, the choices are "I already paid @old" or the
  other method, if the list has one. The notice relies on the list query's
  refetch (on focus, once it is 30 seconds stale), so a guest back within
  30 seconds may not see a change made in that window; accepted.
- **Draft (`contributeDraft.ts`):** stores the pair; on resume, a changed
  handle gets the same notice. A draft saved before this change has none
  and resumes with the current handles.
- **A gift removed while paying:** the owner can delete a group gift no
  one has pledged to yet (and then clear both handles), so "I've sent it"
  can get a 404 after the guest has paid. Nothing can be recorded without
  the gift. On the pay step a 404 reads "This gift was removed while you
  were paying. If you already sent money, let the owner know." instead of
  the generic reload message, once a refetch of the list confirms the gift
  is gone (an expired session is a 404 too). `ListPage` today drops a
  draft whose gift is gone without a word; it shows the same message
  instead. It also resumes a draft whose gift others have fully funded
  (it checks only that the gift is a group gift still on the list), with a
  note: "Others finished funding this gift while you were paying. If you
  already sent money, record it here." All of this ships in the dialog PR.
- **Gift details card (`ContributionsCard`):** a pledge reads
  "Sam · $40 via Venmo to @handle". One that isn't current adds "(not your
  current handle)". An erased one reads "via Venmo (handle removed)". One
  without a method adds "method not recorded".
- **Edit list details form:** Venmo and Zelle fields, prefilled from the
  manage view, trimmed like every other field, with the create form's
  hints.
- **Privacy page:** its statements are true of the code, so it changes
  with the code that changes them:
  - with the pledge's method (step 3): "What guests enter" says a pledge
    stores the method and handle the guest paid to, and the cookie
    paragraph lists the method and handle among what a draft holds;
  - with editing (step 4): past payment handles are kept only as part of
    the pledges that named them, and changing a handle replaces it;
  - nothing may say handles "go with the list": no code deletes lists.

### ADRs

One docs PR before the code:

- **New ADR:** owner payment handles are owner PII in `owner_pii`, one row
  per record, per ADR-0057's side-table pattern; a pledge's handle is the
  guest's report, recorded without proof.
- **ADR-0082**, amended: handles are editable with the list details;
  clearing both is refused while the list has a group gift.
- **ADR-0045**, amended: the snapshot is `{ method, handle }` as the guest
  reports it, in the pledge's own `owner_pii` row, never refused for being
  stale; `label` is dropped; pledges made before it have none.

## Order of the work

1. The `pii_ref` → `guest_pii_ref` rename stack (about 6–8 PRs), then its
   docs PR.
2. The ADR PR.
3. Owner PII and the pledge's method: migration and repositories (list
   handles move to `owner_pii`), domain, pledge request, dialog and draft
   (with the removed-gift message), gift details, card, privacy page.
4. Editing: domain, manage view handles, edit request, form, the dialog's
   change notices (nothing can change a handle before this), privacy page.
5. One e2e journey: a guest pledges by Venmo, the owner changes the
   handle, the owner's gift details show the old handle flagged.

The change notices and the removed-gift message are component tests, not
more journeys. Steps 3–4 are about 11–13 PRs, so they ship as two stacks of
at most 8.

## Left to the builder

- The error's class name, code and exact copy, within the error-copy rule
  in `actionErrorMessage.ts`.
- The exact copy on the card, notices and privacy page, within the wording
  above.
- The foreign keys between `wishlists` and `owner_pii`, which point both
  ways (SQLite enforces them here), and the order of writes that satisfies
  them.
- How to split the PRs within the 10-file cap and the order above.
