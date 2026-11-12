---
title: Panel: rebuild, cancel and unblock controls
status: todo
created-at: 2026-11-13
---

# Intent: Panel: rebuild, cancel and unblock controls

Author: Ronaldo Gomes. Status: todo

## Problem

Users want to act on builds from the panel without opening Buildkite, safely and only when permitted.

## Proposed outcome

Build rows show Rebuild on finished builds, Cancel on active builds and Unblock on blocked steps, only when `canWriteBuilds`; Cancel and Unblock open a confirmation ("Cancel build #123 on <pipeline>?"); buttons show a spinner while running; success refreshes the list; a `forbidden` answer shows the inline row error; block steps with fields show an "Unblock in Buildkite" link instead.

- AC19: Rebuild runs immediately and the new build appears in the list on the next refresh; Cancel and Unblock each ask for confirmation first.
- AC20: When the token lacks the build-write scope, the Rebuild, Cancel and Unblock buttons are not shown.
- AC21: When Buildkite refuses an action for a specific pipeline, the build row shows an inline error ("You don't have permission to do this on <pipeline>") and nothing is retried.
- AC22: A blocked step that has input fields shows "Unblock in Buildkite" (opens the browser) instead of an in-panel Unblock button.

## Affected users and systems

`src/panel.tsx` / panel modules, panel tests, check scenarios.

## Constraints

- Follow tmp/team/design.md.
- Depends on: T4, T7.
- Spec: docs/specs/buildkite-builds-panel.md. Panel/worker contract, decisions and the token rules: tmp/team/handoff.md in the main worktree ("API contract", "Decisions already made").

## Out of scope

Everything else; this is the last task.

## Open questions

None
