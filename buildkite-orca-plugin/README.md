# Buildkite

A right-sidebar panel that shows the Buildkite builds of the active Orca workspace.

## What it does

- **Sign in.** The panel asks for a Buildkite API token (masked field). The token needs read access to user, organizations, pipelines and builds; add write builds to enable Rebuild, Cancel and Unblock. The worker checks it against Buildkite (`GET /v2/access-token` for scopes, `GET /v2/user` for the name) before storing it in Orca's secret storage (`secrets:own`). Only the worker reads the token, and it sends it only to `https://api.buildkite.com` in the `Authorization: Bearer` header. Panel answers and events never carry it. Replace token validates the new token before overwriting the old one; Sign out deletes it. If Buildkite rejects the stored token later, the worker deletes it and the panel returns to sign-in with "Your Buildkite token is no longer valid".
- **Pick the project.** The worker reads the active workspace's `origin` remote with `git` and matches it against the repository of every pipeline the token can see, in all organizations. Host, owner and repo are compared case-insensitively, ignoring protocol, user, port and a trailing `.git`, so SSH and HTTPS forms match. With no match (or no remote) the panel shows "No Buildkite pipeline matches this project" and a searchable picker of all visible pipelines. The choice is stored per workspace in plugin storage and can be changed or reset to automatic matching. A workspace Orca can't identify uniquely has no id, so no choice can be saved for it.
- **List builds.** Up to 20 builds from the matched pipelines: active builds (running, scheduled, blocked, canceling) first, then the most recent finished ones, each newest first. Each row shows state, number, pipeline, branch, first line of the commit message, author, start time and duration, and a link to the build in the browser; expanding a row lists its jobs. With several pipelines the rows are labelled and a pipeline filter narrows the list. "This branch only" (off by default, disabled on a detached HEAD) limits builds to the workspace's branch. The filter, the toggle and the expanded builds are remembered per workspace.
- **Refresh.** Every 15 seconds while the panel is open, and on the Refresh button. On HTTP 429 the panel keeps the last data, shows "Rate limited, retrying in Ns" and waits for the `RateLimit-Reset` time. On a network failure it shows "Can't reach Buildkite" with Retry and marks the builds as stale.
- **Act on builds.** Rebuild runs immediately; Cancel and Unblock ask for confirmation. The buttons are hidden when the token lacks `write_builds`. If Buildkite refuses an action for a pipeline, the row shows an inline error and nothing is retried. Block steps show "Unblock in Buildkite" instead of an in-panel Unblock: Buildkite's REST and GraphQL APIs don't expose whether a block step has input fields (`src/block-fields.ts`), so every block step is treated as having them and `jobs.unblock` refuses.

The manifest asks for `storage:own`, `secrets:own` and `workspace:read` (to learn the active workspace's path and branch).

## Layout

Worker (`src/worker.ts` registers the handlers):

- `src/auth.ts`: token validation, storage, sign-out, and the authenticated Buildkite call every other module uses.
- `src/bk-client.ts`: the only code that talks to Buildkite; maps HTTP statuses to `BkError` kinds with fixed, token-free messages.
- `src/project.ts`, `src/remote.ts`: visible pipelines, remote normalization, per-workspace choice, `project.changed` on workspace change.
- `src/builds.ts`: `builds.list`. `src/actions.ts`: rebuild, cancel, unblock.

Panel (`src/panel.tsx`): sign-in and account, `src/project-view.tsx` (picker, pipeline filter, per-workspace preferences), `src/builds-view.tsx` (list, jobs, polling, actions).

`src/protocol.ts` types the requests and events between the two. Failures come back as `{ ok: false, error }` values, never thrown.

## How it is built

The panel asks with `plugin.request`, the worker answers with `orca.panels.handle` and tells every open panel with `orca.panels.post`. Orca transpiles both files when they load, so there is no build step: save and the panel or worker reloads (a worker reload drops its in-memory state, so keep what must last in storage). `orca plugin test .` runs the panel and worker tests in Node with `orca/testing`, including `src/leak.test.ts`, which runs every flow with a known token and asserts it never shows up in logs, output, errors or non-secret storage. `orca plugin check .` renders the panel with the worker in each `src/panel.check.ts` scenario; `npx tsc -p .` type-checks against the typings `orca plugin types .` writes to `.orca/types/`. With the folder loaded, `orca plugin dev request . auth.status` calls the worker as the panel does.

## Develop

```sh
orca plugin validate .
orca plugin dev watch .    # loads this folder into Orca and prints its logs and reloads; Ctrl-C unloads it
```

Orca names the publisher after where the plugin is installed from: the GitHub or GitLab owner of
its repository, or `local` for a folder. See
https://github.com/stablyai/orca/blob/main/docs/reference/plugin-authoring.md.

## Emoji credits

Job names in the panel show Buildkite's emoji (`:pipeline:`, `:docker:`) as images from `assets/emoji/`, a copy of the `img-buildkite-64` set from [buildkite/emojis](https://github.com/buildkite/emojis). The repository has no licence file; each logo is owned by its respective creator. Standard shortcodes (`:rocket:`) show as Unicode emoji, and unknown ones are left out. Orca's `Image` shows only PNG, JPEG and WebP, so the few GIF-only shortcodes (such as `:partyparrot:`) are treated as unknown and left out. `src/emoji-data.ts` and `assets/emoji/` are generated from that repository's `img-buildkite-64.json` and `img-apple-64.json`: clone it, then run `bun scripts/generate-emoji-data.ts <clone> --sync-assets` from this folder. Orca's `Image` draws `size="xs"` 48px wide whatever the picture's shape, so `--sync-assets` (which needs ImageMagick, e.g. `brew install imagemagick`) re-encodes every image as a PNG on a transparent 192x64 canvas, logo centered and scaled to the canvas height; Orca shows each one as a 48x16 box with a logo about 16px tall.
