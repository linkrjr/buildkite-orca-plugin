---
title: Panel: sign-in, account header and counter removal
status: todo
created-at: 2026-11-13
---

# Intent: Panel: sign-in, account header and counter removal

Author: Ronaldo Gomes. Status: todo

## Problem

The panel must let the user sign in with a Buildkite token, see who they are signed in as, replace the token or sign out, and the scaffold's counter demo must go.

## Proposed outcome

The panel shows the signed-out form (masked token field, scopes note, link to Buildkite's API token page, spinner while validating, inline errors), and when signed in a header with "Signed in as <name>", a menu with Replace token and Sign out. It follows `auth.changed` (incl. the token-rejected message). The counter demo is removed everywhere (panel, worker handlers, protocol entries, tests, check scenarios); the panel shows a placeholder body for the signed-in state that T6/T7 fill.

- AC1: With no stored token, the panel shows a sign-in form with a masked token field and a short note on the required token scopes; no builds are requested.
- AC2: Submitting a valid token validates it against Buildkite, stores it in Orca's secret storage, and the panel then shows "Signed in as <Buildkite user name>". (panel side)
- AC3: Submitting an invalid or revoked token shows "Buildkite rejected this token" and stores nothing; the field is cleared. (panel side)
- AC4: After saving, the token is never sent back to the panel: no panel request or event payload contains it, and Replace token shows an empty field. (panel side: never keep the token in atoms/storage after submit)
- AC7: Sign out deletes the stored token and returns the panel to the sign-in form; Replace token validates the new token before overwriting the old one, keeping the old one if validation fails. (panel side)
- AC25: When Buildkite rejects a stored token (revoked or expired) during normal use, the panel returns to the sign-in form with "Your Buildkite token is no longer valid". (panel side)
- AC27: The counter demo panel and its requests are gone; the plugin shows only the Buildkite panel.

## Affected users and systems

Developers using the panel. `src/panel.tsx` (and new panel modules), panel tests, `src/panel.check.ts` scenarios, removal of counter code in worker/protocol/tests, manifest description.

## Constraints

- Follow the design doc tmp/team/design.md (main worktree) for layout and copy.
- The token lives in the panel only inside the input until submit; clear it right after submit; never persist it.
- Depends on: T1.
- Spec: docs/specs/buildkite-builds-panel.md. Panel/worker contract, decisions and the token rules: tmp/team/handoff.md in the main worktree ("API contract", "Decisions already made").

## Out of scope

Pipelines UI (T6), builds list (T7), action controls (T8).

## Open questions

None
