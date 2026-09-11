# Self-Hosted Wishlist — Requirements & Architecture Spec

An open source, privacy-focused, self-hosted wishlist and registry service.
A list owner publishes items; guests claim items or contribute money toward
group gifts and open funds. Designed for weddings, baby showers, birthdays,
and similar events.

**Full requirements:** [`docs/spec/`](docs/spec/README.md), one file per
topic. **Decisions:** [`docs/adr/`](docs/adr/README.md), one file per ADR.

## Design principles

1. **No accounts.** Access is by unguessable URL plus a shared key. Nobody registers to give or receive.
2. **No outbound requests at runtime** by default. No CDN, no analytics, no telemetry, no error reporting.
3. **The server is authoritative.** Business rules live server-side; clients ask rather than decide.
4. **YAGNI.** Complexity is added where it demonstrably pays (the ledger), not uniformly.
5. **Ten-minute setup.** A self-hosted project nobody can run is a project nobody uses.

## Non-goals

- No payment processing; the service never takes custody of funds
- No affiliate links
- No price tracking or monitoring (outbound-request privacy leak)
- No user accounts
- No social features, comments, or feeds
- No protection against a hostile server operator (they own the database)
