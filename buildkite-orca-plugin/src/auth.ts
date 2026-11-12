// Token lifecycle: validate -> store as a secret -> use. The panel never reads the token; only
// this module does, and answers carry the signed-in profile, never the token.
import type { OrcaWorkerApi } from 'orca/worker'
import { bkRequest } from './bk-client'
import type { AuthState, Result } from './protocol'

const TOKEN_KEY = 'token'
const PROFILE_KEY = 'auth.profile'

type SignedIn = Extract<AuthState, { state: 'signedIn' }>

export function createAuth(orca: OrcaWorkerApi) {
  const listeners: (() => void)[] = []
  const setState = (state: AuthState) => {
    listeners.forEach((l) => l())
    orca.panels.post('auth.changed', state)
  }

  async function status(): Promise<AuthState> {
    const token = await orca.secrets.get(TOKEN_KEY)
    const profile = (await orca.storage.get(PROFILE_KEY)) as Omit<SignedIn, 'state'> | undefined
    return token && profile ? { state: 'signedIn', ...profile } : { state: 'signedOut' }
  }

  async function validate(token: string): Promise<Result<Omit<SignedIn, 'state'>>> {
    const scopes = await bkRequest(token, 'GET', '/v2/access-token')
    if (!scopes.ok) return scopes
    const user = await bkRequest(token, 'GET', '/v2/user')
    if (!user.ok) return user
    const u = user.value as { name?: string; email?: string }
    const granted = (scopes.value as { scopes?: string[] }).scopes ?? []
    return {
      ok: true,
      value: {
        user: { name: u.name ?? '', ...(u.email ? { email: u.email } : {}) },
        canWriteBuilds: granted.includes('write_builds')
      }
    }
  }

  async function signIn(raw: unknown): Promise<Result<AuthState>> {
    const token = typeof raw === 'string' ? raw.trim() : ''
    // A header-unsafe token (newline, non-Latin-1) would make fetch throw before any request.
    if (!token || !/^[\x21-\x7e]+$/.test(token)) {
      return { ok: false, error: { kind: 'token_invalid', message: 'Buildkite rejected this token' } }
    }
    const checked = await validate(token)
    if (!checked.ok) return checked
    const previous = await orca.secrets.get(TOKEN_KEY)
    try {
      await orca.secrets.set(TOKEN_KEY, token)
      await orca.storage.set(PROFILE_KEY, checked.value)
    } catch {
      // Keep token and profile consistent: put back the old token, or drop the new one.
      await (previous ? orca.secrets.set(TOKEN_KEY, previous) : orca.secrets.delete(TOKEN_KEY)).catch(() => {})
      return { ok: false, error: { kind: 'buildkite_error', message: "Couldn't save the token" } }
    }
    const state: AuthState = { state: 'signedIn', ...checked.value }
    setState(state)
    return { ok: true, value: state }
  }

  async function signOut(reason?: 'token_rejected'): Promise<AuthState> {
    await orca.secrets.delete(TOKEN_KEY)
    await orca.storage.delete(PROFILE_KEY)
    const state: AuthState = reason ? { state: 'signedOut', reason } : { state: 'signedOut' }
    setState(state)
    return state
  }

  /** Authenticated Buildkite call with the stored token. A 401 means the token was revoked:
   *  delete it and tell the panel (AC25). */
  async function request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<Result<unknown>> {
    const token = await orca.secrets.get(TOKEN_KEY)
    if (!token) {
      await signOut('token_rejected')
      return { ok: false, error: { kind: 'token_invalid', message: 'Your Buildkite token is no longer valid' } }
    }
    const result = await bkRequest(token, method, path, body)
    if (!result.ok && result.error.kind === 'token_invalid') {
      await signOut('token_rejected')
      return { ok: false, error: { ...result.error, message: 'Your Buildkite token is no longer valid' } }
    }
    return result
  }

  /** Calls `listener` whenever the token changes: sign-in (new or replaced) and sign-out. */
  const onChange = (listener: () => void) => { listeners.push(listener) }

  return { status, signIn, signOut: () => signOut(), request, onChange }
}

export type Auth = ReturnType<typeof createAuth>
