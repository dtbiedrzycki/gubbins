# 0029. Performance/resource targets set for Pi-class hardware

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The app targets Raspberry Pi 4-class self-hosting hardware with a 256MB
RAM ceiling for the app container ([performance & resource
budget](../spec/performance-and-resource-budget.md)), so concrete
performance and resource targets — and a plan for how the 256MB budget
gets spent — were needed rather than left implicit.

## Decision

We will set performance/resource targets for Pi-class hardware (API
latency, guest-page FCP, bundle size, concurrency) and decompose the
256MB budget explicitly across the V8 heap, the SQLite page cache, and
image-processing concurrency, verified by a load test against real Pi
hardware rather than enforced at runtime.

## Alternatives considered

- **Enforcing the budget as hard runtime limits** — rejected: the
  targets are budgets verified by a load test against real Pi hardware,
  not guarantees enforced in code, which keeps the app from adding
  runtime-policing machinery for a resource ceiling the load test
  already validates.

## Consequences

- The 256MB ceiling is spent deliberately rather than left to whichever
  subsystem happens to allocate first: `--max-old-space-size=128` for
  V8, a small capped `PRAGMA cache_size` (~8MB), image fetch/resize
  concurrency capped at 1 with streaming resize, and headroom
  (~60–80MB) reserved for OS/container overhead.
- Because the targets are budgets, not runtime guarantees, exceeding
  them under real load is a signal to revisit the decomposition rather
  than something the app itself detects and rejects.
- The guest-flow JS budget was raised from 150KB to 200KB gzipped when
  the front-end adopted React 19, Vite 8 and react-router 7. Measured
  against the React 18 / Vite 5 / react-router 6 build it replaced,
  React 19 accounts for ~27KB gzipped of the increase, Vite 8's Rolldown
  output ~6KB and react-router 7 ~6KB, taking the guest flow from 148KB
  to 187KB. The old figure was being cleared by 1.7KB, so no combination
  of those upgrades fitted under it, and per the consequence above
  exceeding a budget is a signal to revisit it rather than to police it.
- The guest-page FCP target (< 2.5s on simulated 4G, no CDN) has **not**
  been re-verified against the larger bundle; the Pi load test is where
  that gets checked.
