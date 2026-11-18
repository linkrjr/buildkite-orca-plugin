// Test double for Buildkite's REST API: replaces globalThis.fetch and records every request.
export type RecordedRequest = { url: string; method: string; headers: Record<string, string>; body?: string }
export type FakeReply = { status: number; json?: unknown; headers?: Record<string, string> } | 'network-error'
export type FakeRoutes = Record<string, FakeReply | ((req: RecordedRequest) => FakeReply)>

export const FAKE_TOKEN = 'bkua_FAKE_TOKEN_0123456789abcdef'

export function installFakeBuildkite(routes: FakeRoutes): { requests: RecordedRequest[]; restore(): void } {
  const requests: RecordedRequest[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const url = String(input)
    const req: RecordedRequest = {
      url,
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers ?? {}) },
      body: init?.body
    }
    requests.push(req)
    const path = url.replace('https://api.buildkite.com', '').split('?')[0]
    const route = routes[`${req.method} ${path}`]
    if (!route) return new Response('{}', { status: 404 })
    const reply = typeof route === 'function' ? route(req) : route
    if (reply === 'network-error') throw new TypeError(`fetch failed for ${url} with ${req.headers.Authorization ?? ''}`)
    return new Response(JSON.stringify(reply.json ?? {}), { status: reply.status, headers: reply.headers })
  }) as typeof fetch
  return { requests, restore: () => { globalThis.fetch = original } }
}

export const validRoutes = (scopes: string[] = ['read_builds', 'write_builds']): FakeRoutes => ({
  'GET /v2/access-token': { status: 200, json: { uuid: 'x', scopes } },
  'GET /v2/user': { status: 200, json: { name: 'Ada Lovelace', email: 'ada@example.com' } }
})
