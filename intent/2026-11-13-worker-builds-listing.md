---
title: Worker: builds listing, ordering and rate limits
status: todo
created-at: 2026-11-13
---

# Intent: Worker: builds listing, ordering and rate limits

Author: Ronaldo Gomes. Status: todo

## Problem

The panel needs the current builds of the project's pipelines, with jobs, in a fixed order, and must survive rate limits and network failures.

## Proposed outcome

The worker answers `builds.list` for a set of pipeline refs and an optional branch: fetches builds per pipeline (with jobs), returns at most 20 ordered active-first (running, scheduled, blocked, canceling; newest first) then the most recent finished (newest first), maps each to the contract's `Build`/`Job` (including `unblockable`/`hasFields` for block steps), and returns `rate_limited` with `retryAfterSec` from `RateLimit-Reset` on 429 and `network` on fetch failure.

- AC12: Builds are ordered with active builds (running, scheduled, blocked, canceling) first, newest first, then the most recent finished builds, newest first, up to 20 builds in total.
- AC14: A "This branch only" toggle (default off) limits builds to the workspace's checked-out branch; its state is remembered per workspace. When the workspace has no branch (detached HEAD), the toggle is disabled with a tooltip explaining why. (worker side: branch filter)
- AC15: Each build row shows state, build number, pipeline, branch, first line of the commit message, author, and start time with duration (live for running builds), plus a link that opens the build in the browser. (worker side: data)
- AC16: Expanding a build lists its jobs with name and state; collapsing hides them. Expansion survives a refresh. (worker side: jobs data)
- AC18: When Buildkite rate-limits, the panel keeps showing the last data with a "Rate limited, retrying in Ns" notice and waits until the limit resets before the next request. (worker side)
- AC24: Network failure shows "Can't reach Buildkite" with a Retry button, keeping any previously loaded builds visible and marked as stale. (worker side: network error)

## Affected users and systems

Worker modules, `src/protocol.ts` (builds.list and Build/Job types), worker tests, T1 leak harness (add these flows incl. error paths).

## Constraints

- Use the Buildkite client from T1. Keep requests minimal (e.g. `state[]` filters / `per_page`) so a refresh across several pipelines stays cheap.
- Depends on: T1.
- Spec: docs/specs/buildkite-builds-panel.md. Panel/worker contract, decisions and the token rules: tmp/team/handoff.md in the main worktree ("API contract", "Decisions already made").

## Out of scope

Pipeline matching (T2), actions (T4), panel UI (T7).

## Open questions

None
