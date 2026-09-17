# 0069. Claude Code and `gh` ship in the development image only, with no baked-in credentials

- **Status:** Accepted
- **Date:** 2026-09-10
- **Deciders:** dtbiedrzycki

## Context

Extending the development image (`Dockerfile.dev`, run as the
devcontainer's `app` service — never the distributed production image)
with Claude Code and `gh` raises the same
constraint the project holds everywhere else credentials touch this
repo: nothing sensitive may end up in a Docker image layer or a
committed file. Both tools also sit downstream of
ADR-[068](./0068-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md)'s
sandbox, so their auth model has to respect that boundary rather than
quietly create a hole in it.

## Decision

We will ship Claude Code and `gh` in the development image only, with
no credentials baked in. Claude Code authenticates via a one-time
interactive `claude login` (OAuth), deliberately not persisted across
rebuilds — re-authenticate after each one. `gh` authenticates via a
fine-grained, repo-scoped (contents + metadata) personal access token
delivered through the existing gitignored `.env`, layering
per-developer values onto [ops](../spec/ops.md)'s conventions, the same
way the project already handles this shape of secret. Both one-time
auth steps — `claude login`'s browser-based OAuth redirect and `gh`'s
PAT being read from `.env` — happen under the plain
`docker-compose.yml`, never under the sandboxed
`docker-compose.sandbox.yml` —
ADR-[068](./0068-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md)'s
allowlist covers ongoing runtime traffic only, not login handshakes.

## Alternatives considered

- **`ANTHROPIC_API_KEY` in place of OAuth** — rejected: incompatible
  with the existing remote-control setup (`claude remote-control`
  requires OAuth and explicitly does not support API keys, so an API
  key here would mean maintaining two auth models for the same tool),
  and it changes the billing surface from the existing subscription to
  pay-as-you-go API credits as a side effect of convenience rather than
  a deliberate choice.
- **Persisting Claude Code's login via a named volume in the canonical
  `docker-compose.yml`** — rejected: mirrors the pattern used for the
  separate remote-control work, but that setup's justification —
  unattended operation, with nobody present to re-trigger login — does
  not hold here. A human is always at the keyboard when the
  devcontainer is in use, so re-authenticating after a rebuild is a
  bounded, occasional annoyance, and a standing volume holding a
  long-lived, reusable token is a cost with no matching benefit.
- **`gh auth login`'s device-flow OAuth, with config persisted to a
  volume** — rejected: it avoids a static bearer token sitting in a
  file at all, but for a single-repo clone-and-occasional-API-call use
  case that advantage didn't justify a second interactive login flow
  and a second credential-storage convention alongside the `.env`
  pattern already in use.
- **Performing either login under `docker-compose.sandbox.yml`** —
  rejected outright: extends the sandboxed network's reach for a
  human-driven action the sandbox wasn't built to carry, undermining
  the blast-radius reasoning
  ADR-[068](./0068-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md)
  exists for — the same reasoning ADR-068 already applied to excluding
  Codeberg from the allowlist.

## Consequences

- Claude Code splits its OAuth state across `~/.claude/` and
  `~/.claude.json` — the latter sits directly at `$HOME`, outside the
  former. Anyone opting into persistence per-developer via the existing
  `docker-compose.override.yml` mechanism (gitignored, personal changes
  only, never the canonical `docker-compose.yml`) has to target the
  whole home directory, not just `~/.claude/`, since a volume can only
  mount a directory and `~/.claude.json` is a file.
- Rebuilds are expected to be rare enough that re-authentication
  doesn't create real friction. If that assumption turns out wrong, the
  fix is to opt into per-developer persistence as above, *not* to reach
  for `ANTHROPIC_API_KEY` out of impatience — that would reopen this
  decision for reasons unrelated to its actual merits.
- `gh` reads `GH_TOKEN` from the environment on every invocation, so
  there is no comparable persistence question for it at all.
- ADR-[068](./0068-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md)'s
  allowlist (`api.anthropic.com`; `github.com`, `api.github.com`,
  `codeload.github.com`, `objects.githubusercontent.com`,
  `raw.githubusercontent.com`) was verified sufficient for both tools'
  *ongoing, already-authenticated* runtime traffic — Claude Code's API
  calls and `gh`'s clone/API calls all land on already-listed hosts —
  but it was never extended to accommodate login itself, and doesn't
  need to be, since login never happens on that network.
- Development image only, same scope as
  ADR-[068](./0068-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md).
  The production image contains neither tool.
