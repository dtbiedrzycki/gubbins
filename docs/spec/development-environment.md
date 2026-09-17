# Development environment

- **Dev Containers spec** (`.devcontainer/devcontainer.json`) — consumed by VS Code, Cursor, Windsurf, JetBrains Gateway, Codespaces, and the `devcontainer` CLI
- `docker-compose.yml` shared between devcontainer and app container
  - One `app` service for normal development; no service the app functionally depends on — SQLite is embedded, so a database container is deliberately absent. The one exception is infrastructure rather than an app dependency: an `egress-proxy` sidecar, present only when running Claude Code in `auto` mode (see below)
  - Base image pinned to a specific Node LTS minor version, not a floating tag, so `npm ci` resolves identically for every contributor
  - Container runs as the invoking host UID/GID to avoid bind-mount permission drift on Linux hosts
- **Local override mechanism**, so checked-in files stay canonical and personal changes never land in a commit by accident:
  - `docker-compose.override.yml`, gitignored, for per-developer compose changes
  - `.env.example` committed; `.env` gitignored, layering per-developer values on top of the [ops](ops.md) defaults
- `postCreateCommand` for `npm ci`
- **Named volume for `node_modules`** — bind-mounting is the classic macOS performance trap
- SQLite data file bind-mounted (not a named volume) in dev, so a developer can inspect or delete `wishlist.db` directly
- `customizations.vscode.extensions` for ESLint/Prettier/Vitest, and `customizations.vscode.settings` for format-on-save; namespaced so other IDEs ignore gracefully
- Dev image separate from the minimal, non-root production image
- **Claude Code sandboxing for `auto`-mode runs** *(ADR-[068](../adr/0068-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md))*: `app` sits
  on an `internal: true` Docker network with no direct route out; a
  single-purpose `egress-proxy` sidecar — the only container with
  external network reach — enforces a domain/SNI-based allowlist (npm
  registry, GitHub, the Anthropic API; deliberately excluding this
  project's own Codeberg remote). Neither container needs
  `NET_ADMIN`/`NET_RAW`, and the allowlist needs no maintenance as DNS or
  CDN IPs rotate, since enforcement never depends on a resolved IP. Not
  used for `default`/`acceptEdits`/`plan` sessions, where a human
  confirms every command already. `bypassPermissions` is out of scope
  entirely and not enabled anywhere in this setup.
- **Claude Code and `gh` in the dev image only, never the production image** *(ADR-[069](../adr/0069-claude-code-and-gh-ship-in-the-dev-image-only.md))*: both installed
  by default in `Dockerfile.dev`. Credentials for neither are ever baked
  into the image. Claude Code auth is a one-time interactive `claude
  login`, deliberately not persisted — its OAuth state lives in the
  container's writable layer and is lost on rebuild, requiring
  re-authentication afterward, by design rather than oversight. `gh`
  auth is a fine-grained, repo-scoped personal access token supplied via
  the existing gitignored `.env`, matching the per-developer-secret
  convention already used elsewhere in this section. Both are set up
  under the plain `docker-compose.yml`, before `docker-compose.sandbox.yml`'s
  egress-proxy layer is ever in the picture.

---

[← Back to spec index](README.md)
