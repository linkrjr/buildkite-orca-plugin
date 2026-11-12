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

declare module 'orca' {
  interface PluginRequests {
    /** The total the worker keeps in storage. */
    'counter.get': { output: { total: number } }
    /** Adds `by` to the stored total and answers the new total. */
    'counter.add': { input: { by: number }; output: { total: number } }
    /** The current sign-in state. */
    'auth.status': { output: AuthState }
    /** Validates the token with Buildkite, then stores it. Also used to replace a token. */
    'auth.signIn': { input: { token: string }; output: Result<AuthState> }
    /** Deletes the stored token. */
    'auth.signOut': { output: AuthState }
  }
  interface PluginPanelEvents {
    /** Posted to every open panel after the total changes. */
    'counter.changed': { total: number }
    /** Posted when the sign-in state changes. */
    'auth.changed': AuthState
  }
}
