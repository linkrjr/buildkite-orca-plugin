# Graph Report - orca-plugin  (2026-11-13)

## Corpus Check
- 42 files · ~26,735 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 4)

## Summary
- 375 nodes · 704 edges · 23 communities (20 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9307880d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Orca Plugin Runtime APIs
- builds.ts
- Intent: Worker: builds listing, ordering and rate limits
- leak.test.ts
- Intent: Panel: rebuild, cancel and unblock controls
- Intent: Panel: builds list, jobs, branch toggle and refresh states
- project-view.tsx
- TypeScript Config
- Intent: Panel: project pipelines, picker and pipeline filter
- Intent: Panel: sign-in, account header and counter removal
- Intent: Worker: rebuild, cancel and unblock actions
- project-view.test.tsx
- Intent: Worker: workspace project and pipeline matching
- builds-view.tsx
- registerProject
- Intent: Worker: token sign-in, storage, Buildkite client and leak harness
- builds-view.test.tsx
- panel.check.ts
- protocol.ts
- panel.test.tsx
- Result
- node-test.d.ts
- mock

## God Nodes (most connected - your core abstractions)
1. `createAuth()` - 17 edges
2. `registerProject()` - 17 edges
3. `installFakeBuildkite()` - 17 edges
4. `refresh()` - 12 edges
5. `Result` - 12 edges
6. `BkError` - 10 edges
7. `registerActions()` - 9 edges
8. `bkRequest()` - 9 edges
9. `BuildsArea()` - 9 edges
10. `BuildCard()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Proposed outcome` --references--> `status()`  [INFERRED]
  intent/2026-11-13-worker-token-and-buildkite-client.md → buildkite-orca-plugin/src/auth.ts
- `Proposed outcome` --references--> `signIn()`  [INFERRED]
  intent/2026-11-13-worker-token-and-buildkite-client.md → buildkite-orca-plugin/src/auth.ts
- `Proposed outcome` --references--> `signOut()`  [INFERRED]
  intent/2026-11-13-worker-token-and-buildkite-client.md → buildkite-orca-plugin/src/auth.ts
- `Proposed outcome` --references--> `BkError`  [INFERRED]
  intent/2026-11-13-worker-token-and-buildkite-client.md → buildkite-orca-plugin/src/protocol.ts
- `Proposed outcome` --references--> `Job`  [INFERRED]
  intent/2026-11-13-worker-builds-listing.md → buildkite-orca-plugin/src/protocol.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Panel-worker request/event messaging flow** — buildkite_orca_plugin_readme_right_sidebar_panel, buildkite_orca_plugin_readme_plugin_worker, buildkite_orca_plugin_readme_plugin_request, buildkite_orca_plugin_readme_orca_panels_handle, buildkite_orca_plugin_readme_orca_panels_post, buildkite_orca_plugin_readme_protocol [EXTRACTED 1.00]
- **Secure Buildkite token lifecycle** — docs_specs_buildkite_builds_panel_tokenhandling, docs_specs_buildkite_builds_panel_secret_storage, docs_specs_buildkite_builds_panel_token_sign_in, docs_specs_buildkite_builds_panel_token_leak_test, docs_specs_buildkite_builds_panel_buildkite_api [EXTRACTED 1.00]
- **Per-workspace build view configuration** — docs_specs_buildkite_builds_panel_remote_matching, docs_specs_buildkite_builds_panel_pipeline_picker, docs_specs_buildkite_builds_panel_pipeline_filter, docs_specs_buildkite_builds_panel_branch_toggle, docs_specs_buildkite_builds_panel_per_workspace_preferences, docs_specs_buildkite_builds_panel_workspace_switching [INFERRED 0.85]

## Communities (23 total, 3 thin omitted)

### Community 0 - "Orca Plugin Runtime APIs"
Cohesion: 0.07
Nodes (34): Buildkite Plugin README, Counter demo (counter.add request), orca.panels.handle, orca.panels.post, orca plugin check scenarios (src/panel.check.ts), orca plugin dev watch, orca plugin test (orca/testing), orca.storage (+26 more)

### Community 1 - "builds.ts"
Cohesion: 0.12
Nodes (24): buildPath(), fail(), invalid(), SLUG, Target, Auth, BlockJobRef, blockStepHasFields() (+16 more)

### Community 2 - "Intent: Worker: builds listing, ordering and rate limits"
Cohesion: 0.29
Nodes (6): Affected users and systems, Constraints, Intent: Worker: builds listing, ordering and rate limits, Open questions, Out of scope, Problem

### Community 3 - "leak.test.ts"
Cohesion: 0.06
Nodes (41): registerActions(), blockedJob, PROFILE, setup(), target, createAuth(), SignedIn, setup() (+33 more)

### Community 4 - "Intent: Panel: rebuild, cancel and unblock controls"
Cohesion: 0.25
Nodes (7): Affected users and systems, Constraints, Intent: Panel: rebuild, cancel and unblock controls, Open questions, Out of scope, Problem, Proposed outcome

### Community 5 - "Intent: Panel: builds list, jobs, branch toggle and refresh states"
Cohesion: 0.25
Nodes (7): Affected users and systems, Constraints, Intent: Panel: builds list, jobs, branch toggle and refresh states, Open questions, Out of scope, Problem, Proposed outcome

### Community 6 - "project-view.tsx"
Cohesion: 0.08
Nodes (47): StaleBadge(), UpdatedAt(), applyAuth(), auth, draft, ErrorNotice(), formError, menuOpen (+39 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.50
Nodes (3): extends, include, ./.orca/types/tsconfig.json

### Community 8 - "Intent: Panel: project pipelines, picker and pipeline filter"
Cohesion: 0.25
Nodes (7): Affected users and systems, Constraints, Intent: Panel: project pipelines, picker and pipeline filter, Open questions, Out of scope, Problem, Proposed outcome

### Community 9 - "Intent: Panel: sign-in, account header and counter removal"
Cohesion: 0.25
Nodes (7): Affected users and systems, Constraints, Intent: Panel: sign-in, account header and counter removal, Open questions, Out of scope, Problem, Proposed outcome

### Community 10 - "Intent: Worker: rebuild, cancel and unblock actions"
Cohesion: 0.25
Nodes (7): Affected users and systems, Constraints, Intent: Worker: rebuild, cancel and unblock actions, Open questions, Out of scope, Problem, Proposed outcome

### Community 11 - "project-view.test.tsx"
Cohesion: 0.20
Nodes (7): api, ops, proj(), signedIn, web, ws(), Pipeline

### Community 12 - "Intent: Worker: workspace project and pipeline matching"
Cohesion: 0.25
Nodes (7): Affected users and systems, Constraints, Intent: Worker: workspace project and pipeline matching, Open questions, Out of scope, Problem, Proposed outcome

### Community 13 - "builds-view.tsx"
Cohesion: 0.13
Nodes (32): Banner(), BranchToggle(), BuildCard(), buildKey(), builds, BuildsArea(), BuildTimes(), clearData() (+24 more)

### Community 14 - "registerProject"
Cohesion: 0.16
Nodes (21): choiceKey(), Deps, Listed, refKey(), registerProject(), activeWorkspace(), getAll(), listVisiblePipelines() (+13 more)

### Community 15 - "Intent: Worker: token sign-in, storage, Buildkite client and leak harness"
Cohesion: 0.17
Nodes (11): request(), signOut(), status(), BkError, Affected users and systems, Constraints, Intent: Worker: token sign-in, storage, Buildkite client and leak harness, Open questions (+3 more)

### Community 16 - "builds-view.test.tsx"
Cohesion: 0.15
Nodes (6): Answer, api, proj(), signedIn, web, ws()

### Community 17 - "panel.check.ts"
Cohesion: 0.20
Nodes (6): all, listing(), sample, signedInState, withProject(), workspace

### Community 18 - "protocol.ts"
Cohesion: 0.22
Nodes (9): BkErrorKind, Build, BuildTarget, Job, orca, PluginPanelEvents, PluginRequests, Project (+1 more)

### Community 20 - "Result"
Cohesion: 0.38
Nodes (6): signIn(), validate(), bkRequest(), fail(), mapStatus(), Result

## Ambiguous Edges - Review These
- `orca.panels.post` → `15s polling while panel open`  [AMBIGUOUS]
  docs/specs/buildkite-builds-panel.md · relation: conceptually_related_to

## Knowledge Gaps
- **12 isolated node(s):** `./.orca/types/tsconfig.json`, `mock`, `orca.panels.handle`, `orca plugin dev watch`, `plugin.request` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 176 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BkError` connect `Intent: Worker: token sign-in, storage, Buildkite client and leak harness` to `builds.ts`, `project-view.tsx`, `builds-view.tsx`, `builds-view.test.tsx`, `panel.check.ts`, `protocol.ts`, `Result`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createAuth()` (e.g. with `request()` and `signIn()`) actually correct?**
  _`createAuth()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `./.orca/types/tsconfig.json`, `mock`, `orca.panels.handle` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Orca Plugin Runtime APIs` be split into smaller, more focused modules?**
  _Cohesion score 0.07112375533428165 - nodes in this community are weakly interconnected._
- **Why does `Proposed outcome` connect `Intent: Worker: token sign-in, storage, Buildkite client and leak harness` to `Result`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `builds.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1164021164021164 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `orca.panels.post` and `15s polling while panel open`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._