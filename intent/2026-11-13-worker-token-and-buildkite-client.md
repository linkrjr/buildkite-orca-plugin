---
title: Worker: token sign-in, storage, Buildkite client and leak harness
status: todo
created-at: 2026-11-13
---

# Intent: Worker: token sign-in, storage, Buildkite client and leak harness

Author: Ronaldo Gomes. Status: todo

## Problem

The panel needs a Buildkite user token to act on the user's behalf, and the token must be stored safely and never leak into logs, terminals, error messages, UI or plain storage. Everything else in the worker talks to Buildkite through one client that holds the token.

## Proposed outcome

The worker answers `auth.status`, `auth.signIn` and `auth.signOut` and posts `auth.changed`; a shared Buildkite HTTP client (HTTPS only, `https://api.buildkite.com`, `Authorization: Bearer` header, never a query parameter) maps responses to the contract's `BkError` kinds with token-free messages, and on HTTP 401 for a stored token deletes it, reports `token_invalid` and posts `auth.changed` signedOut with reason `token_rejected`. A leak-check test harness runs flows with a known fake token and asserts it never appears in logs (`orca.log`/console), answers, events, error messages or non-secret storage; later tasks add their flows to it.

- AC2: Submitting a valid token validates it against Buildkite, stores it in Orca's secret storage, and the panel then shows "Signed in as <Buildkite user name>". (worker side: validation, secret storage, user name in the answer)
- AC3: Submitting an invalid or revoked token shows "Buildkite rejected this token" and stores nothing; the field is cleared. (worker side: nothing stored, error answer)
- AC4: After saving, the token is never sent back to the panel: no panel request or event payload contains it, and Replace token shows an empty field. (worker side)
- AC5: The token string never appears in plugin logs (`orca plugin logs` / `orca plugin dev watch`), in any terminal, in any error message, in the panel's UI, or in non-secret storage — verified by a test that runs every flow (sign-in, list, actions, every error path) with a known token and asserts it appears in none of these outputs. (harness + auth flows)
- AC6: The token is sent only to Buildkite's API over HTTPS, as an authorization header; never as a URL query parameter.
- AC7: Sign out deletes the stored token and returns the panel to the sign-in form; Replace token validates the new token before overwriting the old one, keeping the old one if validation fails. (worker side)
- AC25: When Buildkite rejects a stored token (revoked or expired) during normal use, the panel returns to the sign-in form with "Your Buildkite token is no longer valid". (worker side: token_invalid + auth.changed)

## Affected users and systems

Developers using the Buildkite panel. Worker (`buildkite-orca-plugin/src/worker.ts` and new worker modules), `src/protocol.ts` (add the auth requests/events and shared types from the contract; keep the counter entries for now), `orca-plugin.json` capabilities (`secrets:own`), worker tests.

## Constraints

- Validate with `GET /v2/access-token` (scopes → `canWriteBuilds` = has `write_builds`) and `GET /v2/user` (name).
- Keep the counter handlers working: T5 removes the counter; this task must leave the existing panel working.
- Depends on: none.
- Spec: docs/specs/buildkite-builds-panel.md. Panel/worker contract, decisions and the token rules: tmp/team/handoff.md in the main worktree ("API contract", "Decisions already made").

## Out of scope

Project/pipeline matching (T2), builds listing (T3), actions (T4), and all panel UI (T5-T8).

## Open questions

None
