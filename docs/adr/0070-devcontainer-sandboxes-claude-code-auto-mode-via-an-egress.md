# 0070. Devcontainer sandboxes Claude Code `auto` mode via an egress-proxy sidecar

- **Status:** Accepted
- **Date:** Not recorded (imported from `gubbins-pending-changeset.md`)
- **Deciders:** Not recorded

## Decision

`auto`-mode Claude Code runs in the devcontainer behind an `egress-proxy` sidecar on an `internal: true` network: domain/SNI-based allowlist (not IP-based, so DNS/CDN rotation needs no maintenance), zero `NET_ADMIN`/`NET_RAW` on the agent container itself. Codeberg deliberately excluded from the allowlist. `bypassPermissions` remains entirely out of scope

## Detail

**ADR-070 detail:** The project runs Claude Code in `auto` permission mode
inside the devcontainer, where a safety classifier — not a human —
approves some actions before they execute. Anthropic states the
classifier is not a complete safety boundary on its own, and a coding
agent reading untrusted input (fetched pages, issue text, file content)
remains a live prompt-injection target regardless. `bypassPermissions`
(`--dangerously-skip-permissions`) is explicitly out of scope and is not
enabled anywhere in this project's tooling.

Sandboxing is therefore an independent layer beneath the classifier, not
a redundant one: it bounds the damage on the occasions the classifier is
wrong, rather than trying to make the classifier itself more reliable.
Two containers implement it. `app` (Claude Code and the dev toolchain)
runs on a Docker network marked `internal: true`, which removes any route
out of the container regardless of what a classifier-approved command
attempts. A second, single-purpose `egress-proxy` container is the only
thing bridging that network to the internet; `app` is configured to reach
it via `HTTP_PROXY`/`HTTPS_PROXY`.

The allowlist is enforced by the proxy on hostname/SNI rather than by
resolved IP address. This is a deliberate departure from the
`iptables`/`ipset` pattern used by Anthropic's own reference devcontainer
firewall script, which resolves allowed domains to IPs and periodically
refreshes the set to track rotation and DNS TTLs — a real, working
approach, but one that chases a moving target by design. A proxy reads
the hostname a client asks for and never needs to resolve it to make the
allow/deny decision, so IP rotation and CDN churn require no ongoing
allowlist maintenance.

This also changes where any elevated capability lands. The `iptables`
approach needs `NET_ADMIN`/`NET_RAW` on the sandboxed container itself —
the one running an AI agent with unattended command execution, which is
precisely the container a network-manipulation privilege is least wanted
on. Here, the only container with network posture beyond default is the
small, static, non-agentic proxy; `app` carries no elevated capabilities
at all.

The allowlist covers the npm registry, GitHub, and the Anthropic API.
This project's own Codeberg remote is deliberately excluded: an
`auto`-mode session is expected to work locally and have a human push,
not to have a path from the sandboxed agent to the project's own
repository.

Rejected alternatives: in-container `iptables`/`ipset` (wrong container
for the capability grant, and rotation-chasing the proxy design avoids
structurally); `bypassPermissions` under either firewall design
(considered and rejected outright — removing per-action judgment
entirely is a different risk posture no network control substitutes
for); Codeberg on the allowlist (unnecessary for local write-and-test
work, and an avoidable increase in blast radius); and an allowlist with
no network-topology isolation (leaves a bypass open if something in
`app` ignores the proxy environment variables and dials out directly —
`internal: true` makes that structurally impossible rather than
policy-enforced).

Devcontainer/CI concern only. Has no bearing on the production app's
`no outbound anything by default` runtime behavior (§[3.11](../../gubbins-spec.md#311-ops)).

**Implementation note, added after initial build-out.** The proxy is
Squid (`ubuntu/squid`, pinned to Canonical's current `latest`/`edge`-
aligned build rather than the newest untested push — the tag namespace
has no long-lived stable alias, so this needs periodic re-checking, not
a one-time pin). Three non-obvious behaviors surfaced during setup,
worth recording so they aren't rediscovered:

1. **Squid daemonizes by default**, forking to background and letting
   its foreground process exit once the child is running. In a
   container that foreground exit is PID 1 exiting, so Docker tears the
   container down immediately after an apparently clean startup. Fixed
   with the `-N` (no-daemonize) flag on the service command.
2. **`access_log`/`cache_log` cannot point directly at `/dev/stdout`.**
   Squid opens these as real files via its own `file_open()`, and the
   unprivileged user it drops to internally cannot reopen the
   container's stdout pipe that way, even though it already holds that
   file descriptor from inheritance. The image's own entrypoint already
   solves log visibility differently — it tails real log files under
   `/var/log/squid/` and streams them to stdout itself — so both
   directives point at real files under that directory instead.
3. **Capability set, empirically confirmed rather than assumed:**
   `cap_drop: ALL` plus `cap_add: [SETUID, SETGID]` is sufficient and
   was tested to be necessary — no broader capability is required.
   These two exist because Squid itself starts as root and internally
   drops privilege to an unprivileged user before serving traffic; that
   drop is part of Squid's own security design, not an optional step.
   The `app` container carries no added capabilities at all, consistent
   with ADR-070's original reasoning.

The allowlist itself: `registry.npmjs.org` (npm); `github.com`,
`api.github.com`, `codeload.github.com`, `objects.githubusercontent.com`,
`raw.githubusercontent.com` (GitHub web/API/clone/tarball); and
`api.anthropic.com`. HTTPS is only permitted to these hosts and only on
port 443 — an allowlisted domain does not imply an allowlisted arbitrary
port on that domain.

**Revisited, not reversed:** partway through implementation, a survey of
public Claude Code devcontainer reference setups (including Anthropic's
own) found `iptables`/`ipset` to be the prevailing pattern for exactly
this problem — not a forward proxy. This was treated as a real prompt to
reconsider, not just noted in passing. The decision to continue with the
proxy design stands, on the original ADR-070 grounds (hostname-level
enforcement needs no IP-rotation maintenance, and keeps the elevated
capability off the agent-running container) — but this is recorded
explicitly because the proxy path took substantially more implementation
effort to get working than the prevailing approach would have, which is
a real cost worth weighing if this decision is ever revisited.
