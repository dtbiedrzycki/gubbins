# Backend architecture

**Clean Architecture**, four layers:

```
domain/          Entities, value objects, domain errors. Zero imports.
application/     Use cases + port interfaces. Depends only on domain.
infrastructure/  SQLite repos, event store, metadata fetcher, QR, SMTP, crypto.
presentation/    HTTP routes, zod schemas, DTO mappers, DI wiring.
```

Key ports:

- **`Clock`** — injected `now`; never call `Date.now()` below presentation. Makes the hold lifecycle deterministically testable.
- **`TokenGenerator`** — slugs, owner tokens, hold secrets, creation invite secrets, **and guest-data-access secrets** (§[3.1](access-identity.md), ADR-[060](../adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)). Faked in tests.
- **`UnitOfWork`** — `execute(fn)` wrapping a SQLite transaction.
- **`EventStore`** — `append(itemId, expectedSeq, events)`, throws `ConcurrencyError`.
- **`UrlMetadataFetcher`** — SSRF-guarded, entirely in infrastructure.

Guardrails:

- Domain entities are plain classes — no ORM decorators, no query-builder types
- ESLint `no-restricted-imports` banning `infrastructure/*` from `domain/*` and `application/*`, enforced in CI
- Use cases return domain errors as values or typed exceptions; only presentation maps to HTTP status
- Kysely or Drizzle over a full ORM — repositories own the SQL
- Separate use cases per claim family (`HoldItem`, `ContributeToItem`), not one polymorphic `ClaimItem`
- **Cross-item invariants read projections inside the transaction.** The
  concurrent-hold cap (ADR-[048](../adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)) is the first invariant in the system that
  spans items rather than living within one item's stream. Per-item event
  streams (ADR-[008](../adr/0008-event-streams-scoped-per-item-not-per-list.md)) are the consistency boundary, so this rule sits
  deliberately outside it: `HoldItem` counts the session's active holds
  from the list-wide `holds` projection and appends `ItemHeld` to the
  target item's stream **within a single `UnitOfWork`**. This is correct
  only because SQLite is single-writer and `BEGIN IMMEDIATE` serializes
  the read-then-append against concurrent writers — the count cannot go
  stale between the check and the append. Moving that read outside the
  transaction, or caching it, silently reintroduces a TOCTOU race that
  lets a session exceed the cap; treat it as load-bearing rather than an
  incidental implementation detail. The same constraint applies to any
  future cross-item rule.

---

[← Back to spec index](README.md)
