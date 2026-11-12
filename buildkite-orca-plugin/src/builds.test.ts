import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'
import type { Build, Result } from './protocol'
import { FAKE_TOKEN, installFakeBuildkite, type FakeRoutes } from './testing/fake-buildkite'

type Listed = Result<{ builds: Build[]; fetchedAt: string }>
const P = { org: 'acme', slug: 'web' }
const path = (p = P) => `GET /v2/organizations/${p.org}/pipelines/${p.slug}/builds`

const bk = (n: number, state: string, created: string, extra: Record<string, unknown> = {}) => ({
  number: n,
  state,
  branch: 'main',
  message: 'Fix thing\n\nlong body',
  creator: { name: 'Ada' },
  created_at: created,
  started_at: created,
  finished_at: null,
  web_url: `https://buildkite.com/acme/web/builds/${n}`,
  pipeline: { name: 'Web', slug: 'web' },
  jobs: [],
  ...extra
})

async function list(routes: FakeRoutes, input: { pipelines: { org: string; slug: string }[]; branch?: string }) {
  const fake = installFakeBuildkite(routes)
  const worker = await mountWorker(main, { host: mockHost({ secrets: { token: FAKE_TOKEN } }) })
  try {
    const answer = (await worker.request('builds.list', input)) as Listed
    return { answer, requests: fake.requests, worker }
  } finally {
    fake.restore()
    await worker.deactivate()
  }
}
const numbers = (r: Listed) => (r.ok ? r.value.builds.map((b) => b.number) : [])

test('builds.list puts active builds first then finished, each newest first', async () => {
  const { answer } = await list(
    {
      [path()]: (req) =>
        req.url.includes('state')
          ? { status: 200, json: [bk(3, 'running', '2026-01-03T00:00:00Z'), bk(1, 'blocked', '2026-01-01T00:00:00Z')] }
          : { status: 200, json: [bk(4, 'passed', '2026-01-04T00:00:00Z'), bk(3, 'running', '2026-01-03T00:00:00Z'), bk(2, 'failed', '2026-01-02T00:00:00Z')] }
    },
    { pipelines: [P] }
  )
  assert.deepEqual(numbers(answer), [3, 1, 4, 2])
})

test('builds.list returns at most 20 builds', async () => {
  const many = Array.from({ length: 20 }, (_, i) => bk(100 - i, 'passed', `2026-02-${String(20 - i).padStart(2, '0')}T00:00:00Z`))
  const other = { org: 'acme', slug: 'api' }
  const { answer } = await list(
    {
      [path()]: { status: 200, json: many },
      [path(other)]: { status: 200, json: many.map((b) => ({ ...b, number: b.number + 1000 })) }
    },
    { pipelines: [P, other] }
  )
  assert.equal(numbers(answer).length, 20)
})

test('builds.list merges several pipelines newest first', async () => {
  const other = { org: 'zeta', slug: 'api' }
  const { answer } = await list(
    {
      [path()]: { status: 200, json: [bk(1, 'passed', '2026-01-01T00:00:00Z')] },
      [path(other)]: { status: 200, json: [bk(7, 'passed', '2026-01-05T00:00:00Z', { pipeline: { name: 'API', slug: 'api' } })] }
    },
    { pipelines: [P, other] }
  )
  assert.deepEqual(answer.ok && answer.value.builds.map((b) => [b.org, b.pipelineSlug, b.number]), [
    ['zeta', 'api', 7],
    ['acme', 'web', 1]
  ])
})

test('builds.list maps a build to the contract shape', async () => {
  const { answer } = await list(
    { [path()]: { status: 200, json: [bk(5, 'failed', '2026-01-01T00:00:00Z', { finished_at: '2026-01-01T00:05:00Z' })] } },
    { pipelines: [P] }
  )
  assert.deepEqual(answer.ok && answer.value.builds[0], {
    org: 'acme',
    pipelineSlug: 'web',
    pipelineName: 'Web',
    number: 5,
    state: 'failed',
    branch: 'main',
    message: 'Fix thing',
    author: 'Ada',
    createdAt: '2026-01-01T00:00:00Z',
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:05:00Z',
    webUrl: 'https://buildkite.com/acme/web/builds/5',
    jobs: []
  })
})

test('builds.list maps jobs including block steps with and without fields', async () => {
  const jobs = [
    { id: 'j1', type: 'script', name: 'Test', state: 'passed' },
    { id: 'j2', type: 'manual', label: 'Deploy?', state: 'blocked', unblock_url: 'https://x/unblock' },
    { id: 'j3', type: 'manual', label: 'Pick', state: 'blocked', unblock_url: 'https://x/u', fields: [{ key: 'a' }] },
    { id: 'j4', type: 'manual', label: 'Done', state: 'unblocked' }
  ]
  const { answer } = await list(
    { [path()]: { status: 200, json: [bk(5, 'blocked', '2026-01-01T00:00:00Z', { jobs })] } },
    { pipelines: [P] }
  )
  assert.deepEqual(answer.ok && answer.value.builds[0].jobs, [
    { id: 'j1', type: 'script', name: 'Test', state: 'passed', unblockable: false, hasFields: false },
    { id: 'j2', type: 'manual', name: 'Deploy?', state: 'blocked', unblockable: true, hasFields: false },
    { id: 'j3', type: 'manual', name: 'Pick', state: 'blocked', unblockable: true, hasFields: true },
    { id: 'j4', type: 'manual', name: 'Done', state: 'unblocked', unblockable: false, hasFields: false }
  ])
})

test('builds.list asks Buildkite only for the given branch', async () => {
  const { requests } = await list({ [path()]: { status: 200, json: [] } }, { pipelines: [P], branch: 'feat/x y' })
  assert.ok(requests.length > 0 && requests.every((r) => r.url.includes('branch=feat%2Fx%20y')))
})

test('builds.list does not filter by branch when none is given', async () => {
  const { requests } = await list({ [path()]: { status: 200, json: [] } }, { pipelines: [P] })
  assert.ok(requests.every((r) => !r.url.includes('branch=')))
})

test('builds.list answers an empty list for a pipeline with no builds', async () => {
  const { answer } = await list({ [path()]: { status: 200, json: [] } }, { pipelines: [P] })
  assert.deepEqual(numbers(answer), [])
})

test('builds.list answers rate_limited with retryAfterSec from RateLimit-Reset', async () => {
  const { answer } = await list({ [path()]: { status: 429, headers: { 'RateLimit-Reset': '12' } } }, { pipelines: [P] })
  assert.deepEqual(!answer.ok && [answer.error.kind, answer.error.retryAfterSec], ['rate_limited', 12])
})

test('builds.list answers the longest wait when several pipelines are rate limited', async () => {
  const other = { org: 'acme', slug: 'api' }
  const { answer } = await list(
    {
      [path()]: { status: 429, headers: { 'RateLimit-Reset': '3' } },
      [path(other)]: { status: 429, headers: { 'RateLimit-Reset': '9' } }
    },
    { pipelines: [P, other] }
  )
  assert.equal(!answer.ok && answer.error.retryAfterSec, 9)
})

test('builds.list answers network when Buildkite is unreachable', async () => {
  const { answer } = await list({ [path()]: 'network-error' }, { pipelines: [P] })
  assert.equal(!answer.ok && answer.error.kind, 'network')
})

test('builds.list answers token_invalid and signs out when the token is rejected', async () => {
  const { answer, worker } = await list({ [path()]: { status: 401 } }, { pipelines: [P] })
  assert.equal(!answer.ok && answer.error.kind, 'token_invalid')
  assert.deepEqual(worker.posts[0], { event: 'auth.changed', payload: { state: 'signedOut', reason: 'token_rejected' } })
})

test('builds.list answers an empty list without calling Buildkite when no pipelines are given', async () => {
  const { answer, requests } = await list({}, { pipelines: [] })
  assert.deepEqual([numbers(answer), requests.length], [[], 0])
})

test('builds.list refuses pipeline refs that are not plain slugs', async () => {
  const { answer, requests } = await list({}, { pipelines: [{ org: '../x', slug: 'web' }] })
  assert.deepEqual([answer.ok, requests.length], [false, 0])
})
