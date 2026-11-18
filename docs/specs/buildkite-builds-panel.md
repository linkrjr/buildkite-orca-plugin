# Buildkite builds panel

Type: FEATURE
Tech stack: TypeScript Orca plugin — components panel (TSX) in the right sidebar plus a trusted worker, no build step; tests with `orca plugin test` (orca/testing) and `orca plugin check` scenarios; type-check with tsc. Token kept in Orca's per-plugin secret storage; preferences in Orca's per-plugin storage.

## Problem
While working in an Orca workspace, developers have to switch to the Buildkite website to see whether their project's builds are running, failing or waiting for approval. A right-side panel that shows the current project's builds, and lets them rebuild, cancel or unblock, keeps that feedback next to the code. Because it uses a personal Buildkite token, the token must be stored safely and must never leak into logs or terminals.

## User stories
- As a developer, I can sign in once with my Buildkite user token so that the panel can read builds on my behalf.
- As a developer, I see only the pipelines and builds my token is allowed to see, so the panel never shows anything Buildkite would not show me.
- As a developer, I open the panel in a workspace and immediately see the builds of the pipeline(s) built from that workspace's repository.
- As a developer, I can narrow the list to the branch I have checked out.
- As a developer, I can expand a build to see its jobs and their states.
- As a developer, I can rebuild, cancel or unblock a build from the panel when my token and Buildkite permissions allow it.
- As a developer whose repository is not matched automatically, I can pick the pipeline(s) to follow for this workspace.
- As a developer, I can replace my token or sign out, and trust that the token is never shown in logs, terminals or error messages.

## Acceptance criteria
- AC1: With no stored token, the panel shows a sign-in form with a masked token field and a short note on the required token scopes; no builds are requested.
- AC2: Submitting a valid token validates it against Buildkite, stores it in Orca's secret storage, and the panel then shows "Signed in as <Buildkite user name>".
- AC3: Submitting an invalid or revoked token shows "Buildkite rejected this token" and stores nothing; the field is cleared.
- AC4: After saving, the token is never sent back to the panel: no panel request or event payload contains it, and Replace token shows an empty field.
- AC5: The token string never appears in plugin logs (`orca plugin logs` / `orca plugin dev watch`), in any terminal, in any error message, in the panel's UI, or in non-secret storage — verified by a test that runs every flow (sign-in, list, actions, every error path) with a known token and asserts it appears in none of these outputs.
- AC6: The token is sent only to Buildkite's API over HTTPS, as an authorization header; never as a URL query parameter.
- AC7: Sign out deletes the stored token and returns the panel to the sign-in form; Replace token validates the new token before overwriting the old one, keeping the old one if validation fails.
- AC8: When the active workspace's git remote matches the repository of one or more pipelines the token can see (in any organization), the panel lists builds from all of those pipelines; SSH and HTTPS forms of the same remote, with or without a trailing `.git`, count as a match.
- AC9: Pipelines the token cannot access never appear in the build list, the pipeline picker or the pipeline filter.
- AC10: When no visible pipeline matches (or the workspace has no git remote), the panel shows "No Buildkite pipeline matches this project" and a searchable picker of every pipeline the token can see, labelled with its organization; the chosen pipelines are remembered for that workspace and shown on the next open.
- AC11: A user can change a workspace's remembered pipelines, or reset to automatic matching, at any time.
- AC12: Builds are ordered with active builds (running, scheduled, blocked, canceling) first, newest first, then the most recent finished builds, newest first, up to 20 builds in total.
- AC13: When several pipelines match, each build is labelled with its pipeline and a pipeline filter narrows the list; the filter choice is remembered per workspace.
- AC14: A "This branch only" toggle (default off) limits builds to the workspace's checked-out branch; its state is remembered per workspace. When the workspace has no branch (detached HEAD), the toggle is disabled with a tooltip explaining why.
- AC15: Each build row shows state, build number, pipeline, branch, first line of the commit message, author, and start time with duration (live for running builds), plus a link that opens the build in the browser.
- AC16: Expanding a build lists its jobs with name and state; collapsing hides them. Expansion survives a refresh.
- AC17: While the panel is open, the list refreshes every 15 seconds and on the Refresh button; no requests are made while the panel is closed.
- AC18: When Buildkite rate-limits, the panel keeps showing the last data with a "Rate limited, retrying in Ns" notice and waits until the limit resets before the next request.
- AC19: Rebuild runs immediately and the new build appears in the list on the next refresh; Cancel and Unblock each ask for confirmation first.
- AC20: When the token lacks the build-write scope, the Rebuild, Cancel and Unblock buttons are not shown.
- AC21: When Buildkite refuses an action for a specific pipeline, the build row shows an inline error ("You don't have permission to do this on <pipeline>") and nothing is retried.
- AC22: A blocked step that has input fields shows "Unblock in Buildkite" (opens the browser) instead of an in-panel Unblock button.
- AC23: While the first load is in progress the panel shows a loading state; when a matched pipeline has no builds, it shows "No builds yet for <pipeline>".
- AC24: Network failure shows "Can't reach Buildkite" with a Retry button, keeping any previously loaded builds visible and marked as stale.
- AC25: When Buildkite rejects a stored token (revoked or expired) during normal use, the panel returns to the sign-in form with "Your Buildkite token is no longer valid".
- AC26: Switching the active Orca workspace updates the panel to the new workspace's pipelines, filters and builds without reopening it.
- AC27: The counter demo panel and its requests are gone; the plugin shows only the Buildkite panel.

## Detailed behaviour

### Signed out
- Heading "Buildkite", a masked token field, a "Sign in" button, and a note: the token needs read access to user, organizations, pipelines and builds; build-write access enables Rebuild, Cancel and Unblock. A link opens Buildkite's API token page.
- While validating: the button shows a spinner and the field is disabled.
- Invalid token: inline error, field cleared, nothing stored.
- Network failure during sign-in: "Can't reach Buildkite", nothing stored.

### Signed in — header
- "Signed in as <name>", a menu with Replace token and Sign out, a Refresh button, and the time of the last successful refresh.
- Controls: pipeline filter (only when more than one pipeline is shown), "This branch only" toggle with the branch name, and "Change pipelines".

### Builds list
- Loading: skeleton rows on first load; later refreshes keep the list and show a small busy indicator.
- Each row: state badge (running, scheduled, blocked, canceling, passed, failed, canceled, skipped, not run), #number, pipeline label, branch, first line of commit message, author, start time and duration.
- Expand: jobs with name and state; block steps show Unblock (or "Unblock in Buildkite" when they have input fields).
- Actions per row, when permitted: Rebuild on finished builds; Cancel on active builds; Unblock on blocked steps. Cancel and Unblock open a confirmation ("Cancel build #123 on <pipeline>?"). While an action runs its button shows a spinner; on success the list refreshes.
- Empty: "No builds yet for <pipeline>" or, with the branch toggle on, "No builds on <branch>".

### No match
- "No Buildkite pipeline matches this project" with the workspace's remote (or "This workspace has no git remote"), and a searchable multi-select list of every visible pipeline grouped by organization. Saving shows their builds; the choice is remembered for this workspace.
- With no visible pipelines at all: "Your token can't see any pipelines."

### Errors
- Network: "Can't reach Buildkite" + Retry; stale data stays visible and marked stale.
- Rate limited: notice with countdown; polling pauses until the reset time.
- Token rejected during use: back to sign-in with an explanation.
- Action refused: inline row error, no retry.
- Any other Buildkite error: "Buildkite returned an error (<status>)" with Retry. Error text never includes request headers or the token.

### No active workspace
- "Open a workspace to see its Buildkite builds."

## Access and permissions
- Only the local Orca user who entered the token uses it; the plugin acts with exactly that token's Buildkite permissions.
- Visibility is whatever Buildkite returns for the token: only organizations, pipelines and builds the token can access are ever listed.
- Rebuild, Cancel and Unblock require the token's build-write scope and the user's permission on that pipeline; both are enforced by Buildkite, and the panel hides or reports accordingly.
- The plugin requests these Orca capabilities: secret storage, own storage, and workspace read (to know the active workspace's repository and branch).

## Business rules
- Token handling:
  - Stored only in Orca's per-plugin secret storage; never in plain storage, settings, files, or panel state.
  - Read only by the worker; never returned to the panel or included in any request answer or event.
  - Never written to logs, terminals, error messages or UI; any error that could echo request details is scrubbed before it is shown or logged.
  - Sent only to Buildkite's API over HTTPS in the authorization header.
  - Validated before saving or replacing; a failed validation never overwrites a stored token.
- Remote matching: compare host, owner and repository name case-insensitively, ignoring protocol (SSH/HTTPS), user part, and trailing `.git`. Uses the workspace's `origin` remote.
- Builds: 20 per view, active first then most recent finished, both newest first.
- Polling: every 15 s while the panel is open; paused while closed; on rate limit, wait until the reset time.
- Remembered per workspace: chosen pipelines (when not auto-matched), pipeline filter, "This branch only" toggle.
- Defaults: branch toggle off; pipeline filter "All matching pipelines".

## Scope
- In scope: token sign-in/replace/sign-out, safe token storage, pipeline matching and manual pick, builds list with jobs, branch toggle, pipeline filter, rebuild/cancel/unblock, auto refresh, all empty/loading/error states, removal of the counter demo.
- Out of scope: job logs, artifacts, annotations, triggering new builds, unblock forms with input fields, notifications, editing pipelines, OAuth or other auth methods, sharing a token across machines.
- Must stay unchanged: the panel lives in Orca's right sidebar; no build step (Orca transpiles on load); the plugin's id stays `buildkite-orca-plugin`.
