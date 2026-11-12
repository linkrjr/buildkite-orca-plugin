---
title: Panel: project pipelines, picker and pipeline filter
status: todo
created-at: 2026-11-13
---

# Intent: Panel: project pipelines, picker and pipeline filter

Author: Ronaldo Gomes. Status: todo

## Problem

The panel must show which pipelines it follows for the current workspace, let the user pick pipelines when none match, change or reset the choice, and filter when several match.

## Proposed outcome

The signed-in panel shows the no-workspace message, the "No Buildkite pipeline matches this project" state with the workspace's remote (or "This workspace has no git remote") and a searchable multi-select picker grouped by organization ("Your token can't see any pipelines." when empty), a "Change pipelines" control with reset to automatic matching, and a pipeline filter (only when more than one pipeline) remembered per workspace. It follows `project.changed` so switching workspace updates it.

- AC9: Pipelines the token cannot access never appear in the build list, the pipeline picker or the pipeline filter. (panel side: only shows what the worker returns)
- AC10: When no visible pipeline matches (or the workspace has no git remote), the panel shows "No Buildkite pipeline matches this project" and a searchable picker of every pipeline the token can see, labelled with its organization; the chosen pipelines are remembered for that workspace and shown on the next open.
- AC11: A user can change a workspace's remembered pipelines, or reset to automatic matching, at any time.
- AC13: When several pipelines match, each build is labelled with its pipeline and a pipeline filter narrows the list; the filter choice is remembered per workspace. (filter control + persistence; labels in T7)
- AC26: Switching the active Orca workspace updates the panel to the new workspace's pipelines, filters and builds without reopening it.

## Affected users and systems

`src/panel.tsx` / panel modules, panel tests, check scenarios.

## Constraints

- Follow tmp/team/design.md. Expose the selected pipelines (after the filter) for T7's builds list.
- Depends on: T2, T5.
- Spec: docs/specs/buildkite-builds-panel.md. Panel/worker contract, decisions and the token rules: tmp/team/handoff.md in the main worktree ("API contract", "Decisions already made").

## Out of scope

Builds list rendering and polling (T7), action controls (T8).

## Open questions

None
