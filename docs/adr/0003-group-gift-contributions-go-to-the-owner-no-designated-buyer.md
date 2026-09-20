# 0003. Group gift contributions go to the owner; no designated buyer

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

A group gift lets several guests contribute toward one item, but the app
never moves money or integrates with a payment processor
(ADR-[004](./0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md)),
and there are no accounts to attach an escrow-like role to
(ADR-[001](./0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md)).
A model was needed for who a group gift's money conceptually goes to and
who is responsible for the actual purchase.

## Decision

We will have all group-gift contributions notionally go to the list
owner, who is the one who buys the item; the app never moves money
between guests and never designates one contributor as "the buyer" who
is expected to make the purchase and be reimbursed by others.

## Alternatives considered

- **Peer-to-peer money movement between contributing guests** — rejected:
  the app never calls a payment API or holds funds
  (ADR-[004](./0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md)),
  so it has no mechanism to move money between guests even if it wanted to.
- **Designated-buyer model, where one guest is nominated to purchase and
  others reimburse them** — rejected: this would need to track a buyer
  identity and reimbursement obligations the app has no accounts system
  to represent
  (ADR-[001](./0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md)),
  and adds a coordination step (agreeing who buys, chasing reimbursement)
  that routing everything through the owner avoids entirely.

## Consequences

- The owner is solely responsible for reconciling and completing
  group-gift purchases.
- No reimbursement tracking or peer-to-peer ledger is needed anywhere in
  the system.
- Group-gift contributions follow the same pledged/confirmed
  reconciliation model as any other contribution
  ([group gifts & funds](../spec/group-gifts-and-funds.md),
  ADR-[004](./0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md)).
