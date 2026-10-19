# 0079. Domain methods are named by what they do to state

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** dtbiedrzycki

## Context

The hold lifecycle gave `Wishlist`, `Item` and `Hold` their first real
method surface. A review of it read the names as a mix of conventions:
`holdItem` and `extendHold` alongside `purchasedCountOf`, `holdStatus`
and `canExtendHold`. Looked at closely, the names already follow one
rule: commands are verb phrases, queries are noun phrases, and
predicates ask a question. That rule was never written down, though,
so nothing stops the next entity from drifting, and a reviewer has
nothing to point to. A few names do break it (see Consequences).

The rule needs to fit two constraints that are already decided.
Commands return the ledger events they cause, so a command has a
return value and the return type cannot tell commands from queries.
And the aggregate decides at the instant it was loaded at
(ADR-[078](./0078-wishlist-is-the-aggregate-root.md)), while the
entities below it take that instant as an argument.

## Decision

We will name methods in `apps/api/src/domain` by what they do to
state:

| Kind | Form | Examples |
|---|---|---|
| **Command:** changes state, may return events | imperative verb + object | `holdItem`, `extendHold`, `purchaseHold`, `addItem`, `placeHold`, `recordEvent`; on the entity itself the object is implied: `Hold.extend`, `Hold.release` |
| **Query:** returns a value, changes nothing | noun phrase, no `get` prefix | `itemStatus`, `holdStatus`, `availableUnits`, `seq` |
| **Predicate:** returns a boolean | `can…`, `is…`, `has…`, or a verb in the third person | `canExtendHold`, `belongsToSession` |
| **Lookup by id** | `get…` throws when absent; `find…` returns `null` | `getItem` throws `ItemNotFoundError`; `findHold` returns `Hold \| null` |
| **Factory** | static `create…` for new instances; static `reconstitute` for persisted ones | `Wishlist.create`, `Item.createSingle`, `Hold.reconstitute` |

Three refinements:

- **A command's question form is `can` + the command's name.** It
  answers whether that command would succeed now, so views offer only
  actions that work: `canPurchaseHold` for `purchaseHold`.
- **Suffixes name the argument's role.** `At` means the caller
  supplies the instant (`Hold.statusAt(at)`, `Hold.canExtendAt(at)`).
  The aggregate's own methods never take an instant and never carry
  `At`. `Given` means the caller supplies facts the entity cannot see
  (`Item.statusGiven(activeHolds, purchasedCount)`).
- **On the aggregate root, queries about a carried entity name the
  subject first:** `itemStatus(itemId)`, `holdStatus(hold)`. Inside an
  entity the subject is `this`, so the name is just the property:
  `Hold.statusAt`, not `holdStatusAt`.

## Alternatives considered

- **`get`/`is` prefixes on every query, Java-bean style
  (`getItemStatus`, `getPurchasedCount`)** — rejected: it repeats the
  existing names with a prefix and no extra meaning. It would also take
  `get…` away from the throwing lookup, and the `get`/`find` split is
  the more useful signal.
- **Verb + noun everywhere (`computeItemStatus`, `countPurchased`)** —
  rejected: commands could no longer be told from queries by name. That
  split is the one a reader of a domain needs most, since return types
  do not show it here.
- **No written convention** — rejected: the names are consistent today
  only by habit, and the review that prompted this ADR shows a reader
  can't see the rule unless it is written down.

## Consequences

- New domain methods are reviewed against the table above.
- Known deviations, left as they are until their code changes for
  another reason, or as one rename once the hold-lifecycle stack has
  merged:
  - `Wishlist.purchasedCountOf(itemId)` puts its subject last;
    subject-first makes it `itemPurchasedCount`.
  - `Item.availableUnits(activeHolds, purchasedCount)` takes
    caller-supplied counts without `Given`, unlike
    `Item.statusGiven`.
- Private helpers (`activeHoldsOn`, `itemOf`, `availableUnitsOf`)
  follow the same rule but are out of scope for the subject-first
  refinement, which governs only the aggregate's public surface.
- The convention covers naming only. It does not settle whether
  `Wishlist` queries take an id or an entity: today items are
  addressed by id and holds by entity, because holds are loaded from
  outside the aggregate.
