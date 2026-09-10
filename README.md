# gubbins

A wishlist application, written in TypeScript on both the front-end and
the back-end.

> **Status: early scaffolding.** The repository currently holds only
> project meta, tooling, and the development environment. The front-end
> and back-end structure and the framework stack have not been chosen
> yet — see `docs/adr/` as those decisions land.

## Development

The supported environment is the dev container in `.devcontainer/`
(Node 24.17, SQLite via `better-sqlite3`, ESLint + Prettier + Vitest).

- **VS Code / editors with dev containers:** open the folder and
  "Reopen in Container".
- **Plain Docker:** `docker compose up -d && docker compose exec app bash`.

Then, once per clone, configure commit signing (required — see below):

```sh
cp .devcontainer/secrets/signing.env.example .devcontainer/secrets/signing.env
# edit signing.env with the name and email your commits are signed under
bash scripts/setup-signing.sh
```

## Signed commits

Every commit in this repository must carry a valid SSH signature from a
key listed in [`.allowed_signers`](.allowed_signers). Verification is
offline and does not depend on GitHub or any other forge:

```sh
bash scripts/verify-signatures.sh        # verify all of HEAD
git verify-commit HEAD                    # verify one commit
```

See [`docs/commit-signing.md`](docs/commit-signing.md) for the trust
model and enforcement details, and
[`CONTRIBUTING.md`](CONTRIBUTING.md) to get set up.

## License

`gubbins` is free software: you can redistribute it and/or modify it
under the terms of the **GNU Affero General Public License, version 3 or
later** (`AGPL-3.0-or-later`).

Copyright (C) 2026 dtbiedrzycki

The full license text is in [`LICENSE`](LICENSE). It is distributed in
the hope that it will be useful, but WITHOUT ANY WARRANTY; see the
license for details.
