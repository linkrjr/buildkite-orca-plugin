// The panel <-> worker contract, declared once: src/panel.tsx and src/worker.ts both read it.

export type BkErrorKind =
  | 'token_invalid'
  | 'network'
  | 'rate_limited'
  | 'forbidden'
  | 'not_found'
  | 'buildkite_error'
  | 'no_workspace'
/** `message` is user-facing text: it never contains the token or request headers. */
export type BkError = {
  kind: BkErrorKind
  message: string
  retryAfterSec?: number
  status?: number
  pipeline?: string
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: BkError }

export type AuthState =
  | { state: 'signedOut'; reason?: 'token_rejected' }
  | { state: 'signedIn'; user: { name: string; email?: string }; canWriteBuilds: boolean }

export type BuildTarget = { org: string; pipeline: string; number: number }
// -- T2: project and pipelines
export type PipelineRef = { org: string; slug: string }
export type Pipeline = PipelineRef & { orgName: string; name: string; repository: string; webUrl: string }
export type Workspace = { id: string; path: string; remote: string | null; branch: string | null }
/** `none` = no match and no manual choice. */
export type Project = { workspace: Workspace | null; source: 'auto' | 'manual' | 'none'; pipelines: Pipeline[] }

declare module 'orca' {
  interface PluginRequests {
    /** The current sign-in state. */
    'auth.status': { output: AuthState }
    /** Validates the token with Buildkite, then stores it. Also used to replace a token. */
    'auth.signIn': { input: { token: string }; output: Result<AuthState> }
    /** Deletes the stored token. */
    'auth.signOut': { output: AuthState }
    /** Rebuilds a build; answers the new build's number. */
    'builds.rebuild': { input: BuildTarget; output: Result<{ number: number }> }
    /** Cancels a build. */
    'builds.cancel': { input: BuildTarget; output: Result<{}> }
    /** Unblocks a block step that has no input fields. */
    'jobs.unblock': { input: BuildTarget & { jobId: string }; output: Result<{}> }
    /** The active workspace and its pipelines: the remembered manual choice, else the auto match. */
    'project.get': { output: Result<Project> }
    /** Every pipeline the token can see, in all organizations; `query` filters by name, slug or org. */
    'pipelines.visible': { input: { query?: string }; output: Result<Pipeline[]> }
    /** Remembers a workspace's pipelines; `null` goes back to automatic matching. */
    'project.choose': { input: { workspaceId: string; pipelines: PipelineRef[] | null }; output: Result<Project> }
  }
  interface PluginPanelEvents {
    /** Posted when the sign-in state changes. */
    'auth.changed': AuthState
    /** Posted when the active workspace changes, or its pipelines do. */
    'project.changed': Project
  }
}
