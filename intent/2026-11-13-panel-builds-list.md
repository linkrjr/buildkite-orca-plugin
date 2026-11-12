---
title: Panel: builds list, jobs, branch toggle and refresh states
status: todo
created-at: 2026-11-13
---

# Intent: Panel: builds list, jobs, branch toggle and refresh states

Author: Ronaldo Gomes. Status: todo

## Problem

The core of the panel: the list of current builds for the selected pipelines, kept fresh while the panel is open, with every loading, empty and error state.

## Proposed outcome

The panel lists builds from `builds.list` for the selected pipelines: rows with state badge, #number, pipeline label, branch, first line of the commit message, author, start time and live duration, open-in-browser link; expandable jobs (expansion survives refresh); a "This branch only" toggle remembered per workspace (disabled with tooltip on detached HEAD); a Refresh button and last-refresh time; polling every 15 s only while open; skeleton on first load, busy indicator on later loads; empty states; "Can't reach Buildkite" + Retry with stale data kept and marked; rate-limit notice with countdown that pauses polling; other errors "Buildkite returned an error (<status>)" + Retry; `token_invalid` returns to sign-in.

- AC12: Builds are ordered with active builds (running, scheduled, blocked, canceling) first, newest first, then the most recent finished builds, newest first, up to 20 builds in total. (panel side: render in worker order)
- AC14: A "This branch only" toggle (default off) limits builds to the workspace's checked-out branch; its state is remembered per workspace. When the workspace has no branch (detached HEAD), the toggle is disabled with a tooltip explaining why.
- AC15: Each build row shows state, build number, pipeline, branch, first line of the commit message, author, and start time with duration (live for running builds), plus a link that opens the build in the browser.
- AC16: Expanding a build lists its jobs with name and state; collapsing hides them. Expansion survives a refresh.
- AC17: While the panel is open, the list refreshes every 15 seconds and on the Refresh button; no requests are made while the panel is closed.
- AC18: When Buildkite rate-limits, the panel keeps showing the last data with a "Rate limited, retrying in Ns" notice and waits until the limit resets before the next request.
- AC23: While the first load is in progress the panel shows a loading state; when a matched pipeline has no builds, it shows "No builds yet for <pipeline>".
- AC24: Network failure shows "Can't reach Buildkite" with a Retry button, keeping any previously loaded builds visible and marked as stale.

## Affected users and systems

`src/panel.tsx` / panel modules, panel tests, check scenarios.

## Constraints

- Follow tmp/team/design.md. Polling lives in the panel (setup subscriptions end with the panel), so nothing runs while it is closed.
- Depends on: T3, T6.
- Spec: docs/specs/buildkite-builds-panel.md. Panel/worker contract, decisions and the token rules: tmp/team/handoff.md in the main worktree ("API contract", "Decisions already made").

## Out of scope

Rebuild/cancel/unblock controls (T8).

## Open questions

None
