---
title: Worker: rebuild, cancel and unblock actions
status: todo
created-at: 2026-11-13
---

# Intent: Worker: rebuild, cancel and unblock actions

Author: Ronaldo Gomes. Status: todo

## Problem

Users want to rebuild, cancel or unblock builds from the panel when their token and Buildkite permissions allow it.

## Proposed outcome

The worker answers `builds.rebuild`, `builds.cancel` and `jobs.unblock` via Buildkite's API, returning `forbidden` (with the pipeline name and the message "You don't have permission to do this on <pipeline>") when Buildkite refuses, never retrying, and refuses to unblock a block step that has input fields.

- AC19: Rebuild runs immediately and the new build appears in the list on the next refresh; Cancel and Unblock each ask for confirmation first. (worker side: rebuild/cancel/unblock calls)
- AC20: When the token lacks the build-write scope, the Rebuild, Cancel and Unblock buttons are not shown. (worker side: canWriteBuilds is already in AuthState from T1; actions answer forbidden if called anyway)
- AC21: When Buildkite refuses an action for a specific pipeline, the build row shows an inline error ("You don't have permission to do this on <pipeline>") and nothing is retried. (worker side)
- AC22: A blocked step that has input fields shows "Unblock in Buildkite" (opens the browser) instead of an in-panel Unblock button. (worker side: refuse in-panel unblock of steps with fields)

## Affected users and systems

Worker modules, `src/protocol.ts` (action requests), worker tests, T1 leak harness (add these flows incl. error paths).

## Constraints

- Use the Buildkite client from T1. Buildkite: `PUT .../builds/{n}/rebuild`, `PUT .../builds/{n}/cancel`, `PUT .../builds/{n}/jobs/{id}/unblock`.
- Depends on: T1.
- Spec: docs/specs/buildkite-builds-panel.md. Panel/worker contract, decisions and the token rules: tmp/team/handoff.md in the main worktree ("API contract", "Decisions already made").

## Out of scope

Panel controls and confirmations (T8), builds listing (T3).

## Open questions

None
