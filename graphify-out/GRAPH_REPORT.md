# Graph Report - orca-plugin  (2026-11-13)

## Corpus Check
- Corpus is ~2,835 words - fits in a single context window. You may not need a graph.

## Summary
- 59 nodes · 71 edges · 8 communities
- Extraction: 89% EXTRACTED · 10% INFERRED · 1% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.84)
- Token cost: 46,578 input · 0 output

## Community Hubs (Navigation)
- Orca Plugin Runtime APIs
- Counter Demo Panel
- Builds List Behaviour
- Pipeline Matching and Permissions
- Token Security and Errors
- Plugin Docs and Tooling
- Panel Worker Protocol
- TypeScript Config

## God Nodes (most connected - your core abstractions)
1. `Plugin worker (src/worker.ts)` - 8 edges
2. `Buildkite Plugin README` - 6 edges
3. `Token Handling Rules` - 6 edges
4. `Right-sidebar panel (src/panel.tsx)` - 5 edges
5. `Per-workspace remembered preferences` - 5 edges
6. `orca.storage` - 4 edges
7. `Buildkite Builds Panel Spec` - 4 edges
8. `Orca per-plugin secret storage` - 4 edges
9. `Token sign-in / replace / sign-out` - 4 edges
10. `Builds list with jobs` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Orca per-plugin secret storage` --semantically_similar_to--> `orca.storage`  [INFERRED] [semantically similar]
  docs/specs/buildkite-builds-panel.md → buildkite-orca-plugin/README.md
- `15s polling while panel open` --conceptually_related_to--> `orca.panels.post`  [AMBIGUOUS]
  docs/specs/buildkite-builds-panel.md → buildkite-orca-plugin/README.md
- `buildkite-orca-plugin (repo README)` --conceptually_related_to--> `Buildkite Plugin README`  [INFERRED]
  README.md → buildkite-orca-plugin/README.md
- `Token Handling Rules` --rationale_for--> `Plugin worker (src/worker.ts)`  [INFERRED]
  docs/specs/buildkite-builds-panel.md → buildkite-orca-plugin/README.md
- `Per-workspace remembered preferences` --references--> `orca.storage`  [INFERRED]
  docs/specs/buildkite-builds-panel.md → buildkite-orca-plugin/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Panel-worker request/event messaging flow** — buildkite_orca_plugin_readme_right_sidebar_panel, buildkite_orca_plugin_readme_plugin_worker, buildkite_orca_plugin_readme_plugin_request, buildkite_orca_plugin_readme_orca_panels_handle, buildkite_orca_plugin_readme_orca_panels_post, buildkite_orca_plugin_readme_protocol [EXTRACTED 1.00]
- **Secure Buildkite token lifecycle** — docs_specs_buildkite_builds_panel_tokenhandling, docs_specs_buildkite_builds_panel_secret_storage, docs_specs_buildkite_builds_panel_token_sign_in, docs_specs_buildkite_builds_panel_token_leak_test, docs_specs_buildkite_builds_panel_buildkite_api [EXTRACTED 1.00]
- **Per-workspace build view configuration** — docs_specs_buildkite_builds_panel_remote_matching, docs_specs_buildkite_builds_panel_pipeline_picker, docs_specs_buildkite_builds_panel_pipeline_filter, docs_specs_buildkite_builds_panel_branch_toggle, docs_specs_buildkite_builds_panel_per_workspace_preferences, docs_specs_buildkite_builds_panel_workspace_switching [INFERRED 0.85]

## Communities (8 total, 0 thin omitted)

### Community 0 - "Orca Plugin Runtime APIs"
Cohesion: 0.19
Nodes (12): Counter demo (counter.add request), orca.panels.handle, orca.panels.post, orca plugin check scenarios (src/panel.check.ts), orca plugin test (orca/testing), orca.storage, plugin.request, Plugin worker (src/worker.ts) (+4 more)

### Community 1 - "Counter Demo Panel"
Cohesion: 0.19
Nodes (4): step, total, activate(), storedTotal()

### Community 2 - "Builds List Behaviour"
Cohesion: 0.29
Nodes (7): This branch only toggle, Builds list with jobs, Per-workspace remembered preferences, Pipeline filter, 15s polling while panel open, Rate limit handling, Active workspace switching

### Community 3 - "Pipeline Matching and Permissions"
Cohesion: 0.40
Nodes (5): Rebuild / Cancel / Unblock actions, Build-write token scope, Manual pipeline picker (no match), Git remote to pipeline matching, Orca workspace read capability

### Community 4 - "Token Security and Errors"
Cohesion: 0.53
Nodes (5): Buildkite API, Error states (network, rate limit, rejected token, refused action), Orca per-plugin secret storage, Token leak test (AC5), Token sign-in / replace / sign-out

### Community 5 - "Plugin Docs and Tooling"
Cohesion: 0.40
Nodes (5): Buildkite Plugin README, orca plugin dev watch, Orca plugin-authoring reference, Publisher naming by install source, buildkite-orca-plugin (repo README)

### Community 6 - "Panel Worker Protocol"
Cohesion: 0.50
Nodes (3): orca, PluginPanelEvents, PluginRequests

### Community 7 - "TypeScript Config"
Cohesion: 0.50
Nodes (3): extends, include, ./.orca/types/tsconfig.json

## Ambiguous Edges - Review These
- `orca.panels.post` → `15s polling while panel open`  [AMBIGUOUS]
  docs/specs/buildkite-builds-panel.md · relation: conceptually_related_to

## Knowledge Gaps
- **11 isolated node(s):** `./.orca/types/tsconfig.json`, `buildkite-orca-plugin (repo README)`, `plugin.request`, `orca.panels.handle`, `orca plugin dev watch` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 23 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Plugin worker (src/worker.ts)` connect `Orca Plugin Runtime APIs` to `Token Security and Errors`, `Plugin Docs and Tooling`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **What connects `./.orca/types/tsconfig.json`, `buildkite-orca-plugin (repo README)`, `plugin.request` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `orca.storage` connect `Orca Plugin Runtime APIs` to `Builds List Behaviour`, `Token Security and Errors`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `Buildkite Plugin README` connect `Plugin Docs and Tooling` to `Orca Plugin Runtime APIs`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `orca.panels.post` and `15s polling while panel open`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._