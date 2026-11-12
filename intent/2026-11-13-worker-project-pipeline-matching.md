---
title: Worker: workspace project and pipeline matching
status: todo
created-at: 2026-11-13
---

# Intent: Worker: workspace project and pipeline matching

Author: Ronaldo Gomes. Status: todo

## Problem

The panel must show builds for the current project: the pipelines built from the active Orca workspace's repository, limited to pipelines the token can see, with a manual choice when nothing matches.

## Proposed outcome

The worker answers `project.get`, `pipelines.visible` and `project.choose` and posts `project.changed` when the active workspace changes. It lists every organization and pipeline the token can access (following pagination), reads the workspace's `origin` remote and branch from git, matches by normalized repository, and remembers a manual choice per workspace (or resets it).

- AC8: When the active workspace's git remote matches the repository of one or more pipelines the token can see (in any organization), the panel lists builds from all of those pipelines; SSH and HTTPS forms of the same remote, with or without a trailing `.git`, count as a match.
- AC9: Pipelines the token cannot access never appear in the build list, the pipeline picker or the pipeline filter. (worker side)
- AC10: When no visible pipeline matches (or the workspace has no git remote), the panel shows "No Buildkite pipeline matches this project" and a searchable picker of every pipeline the token can see, labelled with its organization; the chosen pipelines are remembered for that workspace and shown on the next open. (worker side: source 'none', visible list, remembered choice)
- AC11: A user can change a workspace's remembered pipelines, or reset to automatic matching, at any time. (worker side)
- AC26: Switching the active Orca workspace updates the panel to the new workspace's pipelines, filters and builds without reopening it. (worker side: project.changed)

## Affected users and systems

Worker modules, `src/protocol.ts` (project/pipelines entries), `orca-plugin.json` (`workspace:read` capability, `storage:own` already present), worker tests, and the T1 leak harness (add these flows).

## Constraints

- Use the Buildkite client from T1. Use `workspace.changed` / `workspace.readContext` (workspace:read) for the active workspace; reading git config via node in the workspace path is fine.
- Remote normalization: host, owner, repo compared case-insensitively, ignoring protocol, user part and trailing `.git`.
- Answer `no_workspace` error kind or `workspace: null` per contract when no workspace is active.
- Depends on: T1.
- Spec: docs/specs/buildkite-builds-panel.md. Panel/worker contract, decisions and the token rules: tmp/team/handoff.md in the main worktree ("API contract", "Decisions already made").

## Out of scope

Builds listing (T3), actions (T4), panel UI (T6).

## Open questions

None
