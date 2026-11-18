# Graph Report - orca-plugin  (2026-11-18)

## Corpus Check
- 39 files · ~137,321 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 4)

## Summary
- 364 nodes · 747 edges · 17 communities (16 shown, 1 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `157b70b3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Orca Plugin Runtime APIs
- builds.ts
- build-actions.test.tsx
- leak.test.ts
- panel.test.tsx
- panel.tsx
- project-view.tsx
- TypeScript Config
- generate-emoji-data.ts
- protocol.ts
- project-view.test.tsx
- builds-view.tsx
- registerProject
- builds-view.test.tsx
- panel.check.ts
- node-test.d.ts
- mock

## God Nodes (most connected - your core abstractions)
1. `createAuth()` - 17 edges
2. `registerProject()` - 17 edges
3. `installFakeBuildkite()` - 17 edges
4. `Result` - 14 edges
5. `refresh()` - 13 edges
6. `JobRow()` - 12 edges
7. `BuildCard()` - 11 edges
8. `BkError` - 10 edges
9. `registerActions()` - 9 edges
10. `bkRequest()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Orca per-plugin secret storage` --semantically_similar_to--> `orca.storage`  [INFERRED] [semantically similar]
  docs/specs/buildkite-builds-panel.md → buildkite-orca-plugin/README.md
- `15s polling while panel open` --conceptually_related_to--> `orca.panels.post`  [AMBIGUOUS]
  docs/specs/buildkite-builds-panel.md → buildkite-orca-plugin/README.md
- `buildkite-orca-plugin (repo README)` --conceptually_related_to--> `Buildkite Plugin README`  [INFERRED]
  README.md → buildkite-orca-plugin/README.md
- `Counter demo removal (AC27)` --references--> `Counter demo (counter.add request)`  [INFERRED]
  docs/specs/buildkite-builds-panel.md → buildkite-orca-plugin/README.md
- `Per-workspace remembered preferences` --references--> `orca.storage`  [INFERRED]
  docs/specs/buildkite-builds-panel.md → buildkite-orca-plugin/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Panel-worker request/event messaging flow** — buildkite_orca_plugin_readme_right_sidebar_panel, buildkite_orca_plugin_readme_plugin_worker, buildkite_orca_plugin_readme_plugin_request, buildkite_orca_plugin_readme_orca_panels_handle, buildkite_orca_plugin_readme_orca_panels_post, buildkite_orca_plugin_readme_protocol [EXTRACTED 1.00]
- **Secure Buildkite token lifecycle** — docs_specs_buildkite_builds_panel_tokenhandling, docs_specs_buildkite_builds_panel_secret_storage, docs_specs_buildkite_builds_panel_token_sign_in, docs_specs_buildkite_builds_panel_token_leak_test, docs_specs_buildkite_builds_panel_buildkite_api [EXTRACTED 1.00]
- **Per-workspace build view configuration** — docs_specs_buildkite_builds_panel_remote_matching, docs_specs_buildkite_builds_panel_pipeline_picker, docs_specs_buildkite_builds_panel_pipeline_filter, docs_specs_buildkite_builds_panel_branch_toggle, docs_specs_buildkite_builds_panel_per_workspace_preferences, docs_specs_buildkite_builds_panel_workspace_switching [INFERRED 0.85]

## Communities (17 total, 1 thin omitted)

### Community 0 - "Orca Plugin Runtime APIs"
Cohesion: 0.07
Nodes (34): Buildkite Plugin README, Counter demo (counter.add request), orca.panels.handle, orca.panels.post, orca plugin check scenarios (src/panel.check.ts), orca plugin dev watch, orca plugin test (orca/testing), orca.storage (+26 more)

### Community 1 - "builds.ts"
Cohesion: 0.13
Nodes (20): SLUG, BlockJobRef, blockStepHasFields(), ACTIVE, createBuilds(), forPipeline(), list(), pickError() (+12 more)

### Community 2 - "build-actions.test.tsx"
Cohesion: 0.18
Nodes (8): auth(), build(), forbidden, project, running(), setup(), web, BkError

### Community 3 - "leak.test.ts"
Cohesion: 0.05
Nodes (53): buildPath(), fail(), invalid(), registerActions(), Target, blockedJob, PROFILE, setup() (+45 more)

### Community 4 - "panel.test.tsx"
Cohesion: 0.22
Nodes (3): signedOut, AuthState, Result

### Community 5 - "panel.tsx"
Cohesion: 0.16
Nodes (23): canWriteBuilds, ReadOnlyBadge(), RefreshControls(), StaleBadge(), startBuilds(), UpdatedAt(), applyAuth(), auth (+15 more)

### Community 6 - "project-view.tsx"
Cohesion: 0.12
Nodes (30): applyProject(), choose(), closePicker(), Controls(), currentFilter(), keyOf(), loadError, loadProject() (+22 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.50
Nodes (3): extends, include, ./.orca/types/tsconfig.json

### Community 8 - "generate-emoji-data.ts"
Cohesion: 0.13
Nodes (10): buildkite, Entry, files, pluginDir, [source, flag], unicode, BUILDKITE_EMOJI, UNICODE_EMOJI (+2 more)

### Community 9 - "protocol.ts"
Cohesion: 0.25
Nodes (7): BkErrorKind, Build, BuildTarget, orca, PluginPanelEvents, PluginRequests, Project

### Community 11 - "project-view.test.tsx"
Cohesion: 0.20
Nodes (7): api, ops, proj(), signedIn, web, ws(), Pipeline

### Community 13 - "builds-view.tsx"
Cohesion: 0.10
Nodes (44): actionsDisabled(), ACTIVE, Banner(), BranchToggle(), BuildActions(), BuildCard(), buildKey(), builds (+36 more)

### Community 14 - "registerProject"
Cohesion: 0.16
Nodes (21): choiceKey(), Deps, Listed, refKey(), registerProject(), activeWorkspace(), getAll(), listVisiblePipelines() (+13 more)

### Community 16 - "builds-view.test.tsx"
Cohesion: 0.15
Nodes (6): Answer, api, proj(), signedIn, web, ws()

### Community 17 - "panel.check.ts"
Cohesion: 0.18
Nodes (7): all, listing(), readOnlyState, sample, signedInState, withProject(), workspace

### Community 21 - "node-test.d.ts"
Cohesion: 0.29
Nodes (3): node:fs, node:test, node:url

## Ambiguous Edges - Review These
- `orca.panels.post` → `15s polling while panel open`  [AMBIGUOUS]
  docs/specs/buildkite-builds-panel.md · relation: conceptually_related_to

## Knowledge Gaps
- **12 isolated node(s):** `./.orca/types/tsconfig.json`, `mock`, `orca.panels.handle`, `orca plugin dev watch`, `plugin.request` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 147 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Result` connect `panel.test.tsx` to `builds.ts`, `build-actions.test.tsx`, `leak.test.ts`, `protocol.ts`, `project-view.test.tsx`, `builds-view.tsx`, `registerProject`, `builds-view.test.tsx`, `panel.check.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createAuth()` (e.g. with `request()` and `signIn()`) actually correct?**
  _`createAuth()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `./.orca/types/tsconfig.json`, `mock`, `orca.panels.handle` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Orca Plugin Runtime APIs` be split into smaller, more focused modules?**
  _Cohesion score 0.07112375533428165 - nodes in this community are weakly interconnected._
- **Why does `registerProject()` connect `registerProject` to `leak.test.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `builds.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13043478260869565 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `orca.panels.post` and `15s polling while panel open`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._