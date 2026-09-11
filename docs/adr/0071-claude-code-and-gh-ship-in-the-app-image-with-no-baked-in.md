# 0071. Claude Code and `gh` ship in the `app` image with no baked-in credentials

- **Status:** Accepted
- **Date:** Not recorded (imported from `gubbins-pending-changeset.md`)
- **Deciders:** Not recorded

## Decision

Claude Code and `gh` ship in the `app` image with no credentials baked in. Claude Code: one-time `claude login`, deliberately not persisted across rebuilds — re-authenticate after each one. `gh`: fine-grained repo-scoped PAT via the existing gitignored `.env`. Both auth steps happen under the plain compose file, never under the sandboxed one — ADR-[070](./0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md)'s allowlist covers ongoing runtime traffic only, not login handshakes

## Detail

**ADR-071 detail:** Extending the `app` image with Claude Code and `gh`
raises the same constraint the project holds everywhere else credentials
touch this repo: nothing sensitive may end up in a Docker image layer or
a committed file. Both tools also sit downstream of ADR-[070](./0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md)'s sandbox,
so their auth model has to respect that boundary rather than quietly
create a hole in it.

**Claude Code.** Interactive `claude login` (OAuth), not an API key.
Two reasons. First, this matches the auth model already committed to for
the separate remote-headless work — `claude remote-control` requires
OAuth and explicitly does not support API keys, so an API key here would
mean maintaining two different auth models for the same tool rather than
one. Second, an API key changes the billing surface from the existing
subscription to pay-as-you-go API credits, which isn't a decision this
ADR should make as a side effect of convenience.

The login is deliberately **not persisted** across rebuilds. The
remote-control work needs standing credentials because it runs
unattended, with nobody present to re-trigger login; this devcontainer
has no such constraint — a human is at the keyboard whenever it's in
use, so re-authenticating after a rebuild is a bounded, occasional
annoyance rather than an operational blocker. Weighed against that
mirrored precedent from the remote-control setup, a persisted named
volume is a standing artifact on the host holding a long-lived, reusable
token for as long as nobody thinks to remove it — a cost with no
matching benefit here. Rebuilds are expected to be rare enough that this
doesn't create real friction; if that assumption turns out wrong, the
fix is *not* to reach for `ANTHROPIC_API_KEY` out of impatience (that
would reopen this decision for reasons unrelated to its actual merits),
but to opt in to persistence per-developer via the existing
`docker-compose.override.yml` mechanism (gitignored, personal changes
only) rather than in the canonical, shared `docker-compose.yml`. Anyone
doing that should note Claude Code splits its OAuth state across
`~/.claude/` and `~/.claude.json` — the latter sits directly at `$HOME`,
outside the former — so a named volume for this has to target the whole
home directory, not just `~/.claude/`, since a volume can only mount a
directory and `~/.claude.json` is a file.

**`gh`.** A fine-grained personal access token, scoped to this repository
only (contents + metadata), delivered via `.env` — not `gh auth login`.
The project already has a working convention for exactly this shape of
secret (`.env.example` committed, `.env` gitignored, layering
per-developer values onto §[3.11](../../gubbins-spec.md#311-ops) defaults), and the PAT slots into it with
no new mechanism. `gh auth login`'s device-flow OAuth was considered —
it avoids a static bearer token sitting in a file at all — but for a
single-repo clone-and-occasional-API-call use case, that advantage didn't
justify a second interactive login flow and a second credential-storage
convention alongside the one already in use. Unlike Claude Code, `gh`
reads `GH_TOKEN` from the environment on every invocation, so there's no
comparable persistence question for it at all.

**Auth happens outside the sandbox.** Both one-time steps — `claude
login`'s browser-based OAuth redirect and `gh`'s PAT being read from
`.env` — are performed under the plain `docker-compose.yml`, before
`docker-compose.sandbox.yml`'s `egress-proxy` sidecar is ever involved.
This follows the same reasoning ADR-[070](./0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md) already applied to excluding
Codeberg from the allowlist: an unattended `auto`-mode session should
have no more network reach than its job strictly requires, and a
human-interactive login handshake is not part of that job. ADR-[070](./0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md)'s
allowlist (`api.anthropic.com`; `github.com`, `api.github.com`,
`codeload.github.com`, `objects.githubusercontent.com`,
`raw.githubusercontent.com`) was verified sufficient for both tools'
*ongoing, already-authenticated* runtime traffic — Claude Code's API
calls and `gh`'s clone/API calls all land on already-listed hosts — but
it was never extended to accommodate login itself, and doesn't need to
be if login never happens on that network.

Rejected alternatives: `ANTHROPIC_API_KEY` in place of OAuth (incompatible
with the existing remote-control setup, and changes the billing model as
a side effect); persisting Claude Code's login via a named volume in the
canonical `docker-compose.yml` (mirrors the remote-control pattern, but
that setup's justification — unattended operation — doesn't hold here;
a standing volume holding a reusable token is a cost without a matching
benefit for a devcontainer a human is always present to re-authenticate
in); `gh auth login` with config persisted to a volume (workable, but a
second interactive-login convention alongside the project's established
`.env` pattern, for a use case that doesn't need the marginal security
benefit); performing either login under `docker-compose.sandbox.yml`
(rejected outright — extends the sandboxed network's reach for a
human-driven action the sandbox wasn't built to carry, undermining the
blast-radius reasoning ADR-[070](./0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md) exists for).

Devcontainer/CI concern only, same scope as ADR-[070](./0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md). No bearing on the
production app's runtime.
