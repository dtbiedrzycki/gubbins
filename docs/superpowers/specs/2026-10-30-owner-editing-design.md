# Owner editing: list details, chosen guest key, items — design

Mockups: [`docs/design/owner-editing-mockups.html`](../../design/owner-editing-mockups.html)
(six phone screens).

## Why

Once a list exists, the owner can't change anything on it. A typo in the
title, a stale delivery note, a gift that sold out or changed price all stay
as they are. The most common fix is the guest key: it's three generated
words, and sometimes the words are ones the owner doesn't want on an
invitation. They notice while setting the list up, before anyone has the
key, so the fix belongs on the create form: pick the words before the list
exists.

The owner also can't *see* the list after creating it. The manage page has
only the "add item" form. Editing needs a manage view first.

## Goals

1. **Manage view.** The manage page shows the list's title and description,
   the guest key and guest link (as the creation screen shows them), and
   every item, above the existing "add item" form.
2. **Edit list details.** Title and description.
3. **Choose the key at creation.** The create form shows a suggested key
   with a "Regenerate" button; the owner taps until they like the words and
   submits that key with the list.
4. **Edit items.** Title, quantity, price, store link, description.
5. **Delete items** that no guest has acted on.
6. **No schema changes.** Every phase works on the current schema, so the
   owner can host production now and none of this work needs a migration.

## Behaviour (owner rulings, 2026-10-30)

### List details

- Title and description are edited together in one form ("Edit" on the list
  details section), with the same rules as at creation (see Input handling).
- Guests see the change the next time they load the list.
- Not editable here: the list link (slug), the payment handles
  (ADR-0082 sets them at creation), the owner token.

### Guest key (chosen at creation)

- The create form shows a suggested three-word key, with a "Regenerate"
  button (restart icon beside the label; the label is its accessible name,
  the icon is decorative) that replaces it with another suggestion. No confirmation: nobody
  has a key before the list exists.
- Suggestions come from the server, through a new endpoint that uses the
  existing generator (three EFF words), so the word list stays on the server.
  My call: the endpoint needs no credential, since a random suggestion
  reveals nothing and isn't stored.
- The create request **requires** the key. The server accepts it only if it
  is three words from the generator's word list, joined as the generator
  joins them; anything else is a 400. The owner can't type their own words.
- The "Your list is ready" screen shows the key that was submitted. It has
  no "Regenerate" button.
- **No key change after creation in this work.** The manage page shows the
  key read-only. `keyGen` stays at 1, guest sessions are never invalidated
  by this work, and the access spec's open item for the rotation change
  stays open. Why: a key change after guests have it strands their active
  holds (a guest can change a hold only from the session that placed it,
  and the private hold link isn't built).
- The invite QR and a keyed invite link (ADR-0053, ADR-0067) aren't built;
  the manage page shows the key and plain guest link as the creation screen
  does.

### Items: edit

- Editable: title, quantity, price, store link, description. The kind of
  item (single / group gift) is shown and fixed.
- Group gifts: quantity stays 1 and isn't editable; the price (target) is
  required.
- **Quantity** may go below what is currently held or bought (ADR-0019, kept
  as is): existing holds and purchases stay, new holds are refused until the
  committed count drops below the new quantity. A warning shows before
  saving (mockup screen 5).
- **Price** may change at any time, including after contributions
  (ADR-0018). Lowering a group gift's target to at or below what's already
  pledged shows a confirmation before saving (mockup screen 6). Existing
  pledges are untouched; new pledges are capped against the new target as
  they are today.
- Warnings and hints **say plainly** that guests have held, bought or chipped
  in. The spoiler-mode wording in `docs/spec/owner-dashboard.md` (generic
  reasons, no counts) applies only once a spoiler setting exists; none is
  built, and that rule is untouched.
- The "add item" form's hint "You can't change it after adding the item"
  goes away when item editing ships.

### Items: delete

- An item whose stream has no events (`item_state.seq` is 0) can be deleted,
  after an in-page confirmation. It's a hard delete: the item, its
  `item_state` row, nothing else (it has no holds or contributions).
  No record of the deleted item is kept: no tombstone, snapshot or audit
  row (owner ruling, 2026-10-31).
- An item with **any** event, including a hold later released or expired,
  can't be deleted (ADR-0017). The Delete button is disabled and a hint says
  why: "Guests have already picked this one, so it can't be deleted." The API
  refuses it too.
- No archiving (owner ruling, 2026-10-31): no `archived_at` column and no
  archive action.

### Audit trail: deferred (owner ruling, 2026-10-30)

Out of scope for the launch timeline (YAGNI). Edits overwrite in place and
deletes remove the row, with no history. The researched design (a versions
table with before/after snapshots) is parked for later. Adding it later
needs a migration.

## Input handling (one ruling, 2026-10-30)

Every field keeps exactly the rules it has at creation. Trimming and lengths
follow the settled rules: the domain trims and owns lengths, web forms trim
and mirror limits with `maxLength`, schemas don't trim (ADR-0083: no DB
length CHECKs).

| Field | Trim | Limit | Clearable | Owner |
|---|---|---|---|---|
| List title | yes | 1–120 | no | domain |
| List description | ends only | 2000 | yes → none | domain |
| Item title | yes | 1–120 | no | domain |
| Item description | ends only | 1000 | yes → none | domain |
| Item link | yes | https, 2048 | yes → none | domain |
| Item price, single | n/a | 1 minor unit – `MAX_MONEY_MINOR` | yes → none | domain |
| Item price, group | n/a | same | **no** | domain |
| Item quantity, single | n/a | integer ≥ 1 (web keeps its 1–99 input) | no | domain |
| Item quantity, group | n/a | always 1, not editable | n/a | domain |
| Guest key (create request) | yes, as every bearer secret | three words from the generator's list | required | server suggests and checks |

My call: an edit request carries the full set of editable fields, and an
absent optional field means "none". That makes "cleared" unambiguous.

## Phases

Each phase is deployable and useful on its own, in this order. Each splits
into PRs of at most 10 files (small-prs skill).

1. **Manage view.** An owner-only read of the list (owner cookie, same 404
   rule as other owner routes) returning title, description, key, and items
   with what the delete and warning rules need: whether the item has any
   activity, its committed count, its pledged total. The manage page renders
   it above the add form.
2. **Edit list details**: title and description.
3. **Choose the key at creation**: suggestion endpoint, create request
   requires a key and checks it, create form shows the suggestion with
   "Regenerate". Independent of Phases 1–2; may go first.
4. **Edit items**, with the quantity and target warnings, add
   form hint removed.
5. **Delete items**, with the disabled button and hint.

## Non-goals

- Typing your own key words. Changing the key after creation (manage-page
  refresh, `keyGen` bump), which needs the private hold link first.
- Changing the slug, payment handles, owner token, or an item's kind.
  ADR-0013 allows a kind change before an item's first hold or pledge;
  that stays unbuilt for now.
- Reordering items, archiving, spoiler settings, an audit trail of edits.
- Gift pictures (parked separately).

## Anti-goals

- Any path that changes a list's key after it's created.
- Deleting an item that carries any guest history, by any path.
- Any schema change.

## Constraints

- Aggregate boundary Wishlist → Item → Hold / Contribution (ADR-0078):
  edits go through `Wishlist`; the item decides its own rules.
- The domain decides, the use case persists (ADR-0079 naming; events are
  returned, not raised):
  - The **Item** decides whether it can be deleted (no events on its
    stream) and validates its own edits; **Wishlist** resolves the item
    (`getItem`) and removes or replaces it.
  - The check that a submitted key is one the generator could have made
    lives beside the generator (it owns the word list); the domain's
    `GuestKey` keeps its own invariants unchanged, since older keys must
    still load.
  - The constructors keep enforcing every invariant, so an edited list or
    item can't be invalid whatever path built it.
- List and item edits aren't ledger events (ADR-0007): they're plain CRUD.
- Writes run in an immediate transaction, so an owner edit or delete and a
  guest hold on the same item are serialized; the delete's "no events"
  check and the quantity rule decide on committed state.
- Owner routes return the same generic 404 as today for a missing list or
  missing owner cookie (ADR-0016).
- OpenAPI is generated from route schemas (ADR-0077); regenerate the web
  client types.
- Tests at the owning layer, one per rule (testing-at-the-owning-layer).
- Docs to update as the phases land: `owner-dashboard.md` (editing as
  built). `data-and-persistence.md` keeps its audit-table line as
  unbuilt; `access-identity.md`'s rotation open item stays open.

## Left to the builder

- Route names and shapes for the owner view, edits, key suggestion and delete.
- Whether the owner view extends `GetListView` or is its own use case.
- Edit form layout details beyond the mockups (inline vs separate screen).
- Exact copy beyond what's quoted above.
