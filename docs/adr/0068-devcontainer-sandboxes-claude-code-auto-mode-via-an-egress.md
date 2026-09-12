# 0068. Devcontainer sandboxes Claude Code `auto` mode via an egress-proxy sidecar

- **Status:** Accepted
- **Date:** 2026-09-10
- **Deciders:** dtbiedrzycki

## Context

The project runs Claude Code in `auto` permission mode inside the
devcontainer, where a safety classifier — not a human — approves some
actions before they execute. Anthropic states the classifier is not a
complete safety boundary on its own, and a coding agent reading untrusted
input (fetched pages, issue text, file content) remains a live
prompt-injection target regardless of classifier accuracy.
`bypassPermissions` (`--dangerously-skip-permissions`) is explicitly out of
scope and is not enabled anywhere in this project's tooling. A
network-level sandbox is therefore needed as an independent layer beneath
the classifier — bounding the damage on the occasions the classifier is
wrong, rather than trying to make the classifier itself more reliable.

## Decision

We will run `auto`-mode Claude Code in the devcontainer behind an
`egress-proxy` sidecar on a Docker network marked `internal: true`,
which removes any
route out of the `app` container regardless of what a classifier-approved
command attempts. The single-purpose `egress-proxy` container is the only
bridge to the internet; `app` reaches it via `HTTP_PROXY`/`HTTPS_PROXY`.
The proxy enforces a domain/SNI-based allowlist — `registry.npmjs.org`
(npm); `github.com`, `api.github.com`, `codeload.github.com`,
`objects.githubusercontent.com`, `raw.githubusercontent.com` (GitHub); and
`api.anthropic.com` — HTTPS only, port 443 only; an allowlisted domain does
not imply an allowlisted arbitrary port. This project's own Codeberg remote
is deliberately excluded: an `auto`-mode session is expected to work
locally and have a human push, not to have a path from the sandboxed agent
to the project's own repository. `app` carries zero `NET_ADMIN`/`NET_RAW`
or other elevated network capabilities.

## Alternatives considered

- **In-container `iptables`/`ipset`** (the pattern used by Anthropic's own
  reference devcontainer firewall script, resolving allowed domains to IPs
  and periodically refreshing the set) — rejected: it chases a moving
  target (IP rotation, CDN churn) requiring ongoing allowlist maintenance,
  and it needs `NET_ADMIN`/`NET_RAW` on the very container running
  unattended AI-driven command execution — the container least suited to
  holding a network-manipulation privilege. A hostname/SNI-based proxy
  needs no IP resolution at all, and confines the elevated capability to a
  small, static, non-agentic proxy container instead.
- **`bypassPermissions` under either firewall design** — considered and
  rejected outright: removing per-action judgment entirely is a different
  risk posture that no network control substitutes for.
- **Codeberg on the allowlist** — rejected: unnecessary for local
  write-and-test work, and an avoidable increase in blast radius.
- **An allowlist with no network-topology isolation** (proxy env vars
  alone, without `internal: true`) — rejected: leaves a bypass open if
  something in `app` ignores the proxy environment variables and dials out
  directly; `internal: true` makes that structurally impossible rather than
  policy-enforced.

## Consequences

- Devcontainer/CI concern only; has no bearing on the production app's "no
  outbound anything by default" runtime behavior ([ops](../spec/ops.md)).
- The proxy is Squid (`ubuntu/squid`, pinned to Canonical's current
  `latest`/`edge`-aligned build — the tag namespace has no long-lived
  stable alias, so the pin needs periodic re-checking, not a one-time fix).
- **Follow-up work required to keep this running**, discovered during
  initial build-out:
  - Squid daemonizes by default (forks to background, exits its foreground
    process). In a container that foreground exit is PID 1 exiting,
    tearing the container down right after an apparently clean startup —
    fixed with the `-N` (no-daemonize) flag.
  - `access_log`/`cache_log` cannot point directly at `/dev/stdout`: Squid
    opens them via its own `file_open()`, and the unprivileged user it
    drops to can't reopen the container's inherited stdout pipe that way.
    Both directives point at real files under `/var/log/squid/` instead;
    the image's entrypoint tails them to stdout itself.
  - Capability set, empirically confirmed rather than assumed:
    `cap_drop: ALL` plus `cap_add: [SETUID, SETGID]` is sufficient and
    necessary — Squid starts as root and drops privilege internally as
    part of its own security design. `app` carries no added capabilities
    at all.
- **Revisited, not reversed:** partway through implementation, a survey of
  public Claude Code devcontainer reference setups (including Anthropic's
  own) found `iptables`/`ipset` to be the prevailing pattern for this
  problem, not a forward proxy. That was treated as a genuine prompt to
  reconsider. The decision to continue with the proxy design stands, on
  the original grounds above — but the proxy path took substantially more
  implementation effort to get working than the prevailing approach would
  have, which is a real cost worth weighing if this decision is ever
  revisited.
