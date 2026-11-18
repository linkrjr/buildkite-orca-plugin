# Graph Report - orca-plugin  (2026-11-18)

## Corpus Check
- 35 files · ~26,834 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 4)

## Summary
- 342 nodes · 717 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1c93b44c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Orca Plugin Runtime APIs
- builds.ts
- build-actions.test.tsx
- leak.test.ts
- panel.test.tsx
- protocol.ts
- project-view.tsx
- TypeScript Config
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
6. `JobRow()` - 11 edges
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

## Communities (15 total, 3 thin omitted)

### Community 0 - "Orca Plugin Runtime APIs"
Cohesion: 0.07
Nodes (34): Buildkite Plugin README, Counter demo (counter.add request), orca.panels.handle, orca.panels.post, orca plugin check scenarios (src/panel.check.ts), orca plugin dev watch, orca plugin test (orca/testing), orca.storage (+26 more)

### Community 1 - "builds.ts"
Cohesion: 0.11
Nodes (26): buildPath(), fail(), invalid(), registerActions(), SLUG, Target, BlockJobRef, blockStepHasFields() (+18 more)

### Community 2 - "build-actions.test.tsx"
Cohesion: 0.18
Nodes (7): auth(), build(), forbidden, project, running(), setup(), web

### Community 3 - "leak.test.ts"
Cohesion: 0.06
Nodes (48): blockedJob, PROFILE, setup(), target, createAuth(), request(), signIn(), signOut() (+40 more)

### Community 5 - "protocol.ts"
Cohesion: 0.25
Nodes (7): BkErrorKind, BuildTarget, Job, orca, Pipeline, PluginPanelEvents, PluginRequests

### Community 6 - "project-view.tsx"
Cohesion: 0.07
Nodes (51): canWriteBuilds, ReadOnlyBadge(), RefreshControls(), StaleBadge(), startBuilds(), UpdatedAt(), applyAuth(), auth (+43 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.50
Nodes (3): extends, include, ./.orca/types/tsconfig.json

### Community 11 - "project-view.test.tsx"
Cohesion: 0.20
Nodes (7): api, ops, proj(), signedIn, web, ws(), Project

### Community 13 - "builds-view.tsx"
Cohesion: 0.10
Nodes (46): actionsDisabled(), ACTIVE, Banner(), BranchToggle(), BuildActions(), BuildCard(), buildKey(), builds (+38 more)

### Community 14 - "registerProject"
Cohesion: 0.15
Nodes (22): Auth, choiceKey(), Deps, Listed, refKey(), registerProject(), activeWorkspace(), getAll() (+14 more)

### Community 16 - "builds-view.test.tsx"
Cohesion: 0.17
Nodes (6): Answer, api, proj(), signedIn, web, ws()

### Community 17 - "panel.check.ts"
Cohesion: 0.18
Nodes (7): all, listing(), readOnlyState, sample, signedInState, withProject(), workspace

## Ambiguous Edges - Review These
- `orca.panels.post` → `15s polling while panel open`  [AMBIGUOUS]
  docs/specs/buildkite-builds-panel.md · relation: conceptually_related_to

## Knowledge Gaps
- **12 isolated node(s):** `./.orca/types/tsconfig.json`, `mock`, `orca.panels.handle`, `orca plugin dev watch`, `plugin.request` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 133 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Result` connect `leak.test.ts` to `builds.ts`, `build-actions.test.tsx`, `panel.test.tsx`, `protocol.ts`, `project-view.test.tsx`, `builds-view.tsx`, `registerProject`, `builds-view.test.tsx`, `panel.check.ts`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createAuth()` (e.g. with `request()` and `signIn()`) actually correct?**
  _`createAuth()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `./.orca/types/tsconfig.json`, `mock`, `orca.panels.handle` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Orca Plugin Runtime APIs` be split into smaller, more focused modules?**
  _Cohesion score 0.07112375533428165 - nodes in this community are weakly interconnected._
- **Why does `registerProject()` connect `registerProject` to `builds.ts`, `leak.test.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `builds.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10967741935483871 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `orca.panels.post` and `15s polling while panel open`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._