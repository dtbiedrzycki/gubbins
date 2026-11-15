# gubbins

A self-hosted wishlist for birthdays, weddings and holidays. You make a list,
share a link, and your guests hold gifts so nobody buys the same thing twice.

- **Private.** No ads, no tracking.
- **No accounts.** Not for guests, not for you.
- **Gifts from anywhere.** Add a link from any shop, or describe the thing.
- **Direct payments.** Guests chip in on group gifts by paying you directly
  with Venmo or Zelle.

> **Status: early development.** gubbins is on 0.x releases and still
> changing quickly. Expect rough edges, and back up your database before
> upgrading.

## Using it

Open `/wishlists/new` on a running instance and enter its `CREATE_SECRET` to
create a list. Share the list's invitation link (`/wishlists/:slug`) and its
three-word guest key with your guests. Manage the list at
`/wishlists/:slug/manage`.

## Running your own

gubbins runs as one Docker container with SQLite, aimed at Raspberry
Pi-class home servers behind an HTTPS tunnel. See
[`docs/deploy.md`](docs/deploy.md).

## Development

TypeScript throughout: a Fastify + Kysely API on SQLite, and a Vite + React
front-end styled with Tailwind, served by the API. Design decisions are
recorded in [`docs/adr/`](docs/adr/README.md).

The supported environment is the dev container in `.devcontainer/`
(Node 24.17). Open the folder in an editor with dev-container support and
"Reopen in Container", or run
`docker compose up -d && docker compose exec app bash`. Dependencies install
on start.

Every commit must be SSH-signed. See [`CONTRIBUTING.md`](CONTRIBUTING.md) to
get set up.

## License

`gubbins` is free software: you can redistribute it and/or modify it
under the terms of the **GNU Affero General Public License, version 3 or
later** (`AGPL-3.0-or-later`).

Copyright (C) 2026 dtbiedrzycki

The full license text is in [`LICENSE`](LICENSE). It is distributed in
the hope that it will be useful, but WITHOUT ANY WARRANTY; see the
license for details.
