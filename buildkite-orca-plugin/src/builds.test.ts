import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'
import type { Auth } from './auth'
import { createBuilds } from './builds'
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

const manual = (id: string, label: string, state: string, extra: Record<string, unknown> = {}) => ({
  id,
  graphql_id: `gid-${id}`,
  type: 'manual',
  label,
  state,
  web_url: `https://buildkite.com/acme/web/builds/5#${id}`,
  unblockable: state === 'blocked',
  unblock_url: `https://api.buildkite.com/v2/organizations/acme/pipelines/web/builds/5/jobs/${id}/unblock`,
  ...extra
})

async function jobsOf(jobs: unknown[]) {
  const { answer } = await list(
    { [path()]: { status: 200, json: [bk(5, 'blocked', '2026-01-01T00:00:00Z', { jobs })] } },
    { pipelines: [P] }
  )
  return answer.ok ? answer.value.builds[0].jobs : []
}

test('builds.list names a manual job from its label', async () => {
  const [job] = await jobsOf([manual('j2', 'Deploy?', 'blocked')])
  assert.equal(job.name, 'Deploy?')
})

test('builds.list names a script job from its name', async () => {
  const [job] = await jobsOf([{ id: 'j1', graphql_id: 'g', type: 'script', name: 'Test', state: 'passed' }])
  assert.equal(job.name, 'Test')
})

test('builds.list falls back to the command for an unnamed script job', async () => {
  const [job] = await jobsOf([{ id: 'j1', type: 'script', name: null, command: 'make test\nmake lint', state: 'passed' }])
  assert.equal(job.name, 'make test')
})

test('builds.list keeps unblockable as Buildkite says for a manual job', async () => {
  const jobs = await jobsOf([manual('j2', 'A', 'blocked'), manual('j3', 'B', 'blocked', { unblockable: false })])
  assert.deepEqual(jobs.map((j) => j.unblockable), [true, false])
})

test('builds.list marks a blocked manual job as having fields since nothing confirms otherwise', async () => {
  const [job] = await jobsOf([manual('j2', 'Deploy?', 'blocked')])
  assert.equal(job.hasFields, true)
})

test('builds.list leaves hasFields false for jobs that are not blocked manual jobs', async () => {
  const jobs = await jobsOf([
    { id: 'j1', type: 'script', name: 'Test', state: 'passed' },
    manual('j4', 'Done', 'unblocked'),
    { id: 'j5', type: 'waiter', state: 'passed' }
  ])
  assert.deepEqual(jobs.map((j) => j.hasFields), [false, false, false])
})

test('builds.list does not look up fields for jobs that are not blocked manual jobs', async () => {
  const asked: string[] = []
  const auth = { request: async () => ({ ok: true, value: [bk(5, 'passed', '2026-01-01T00:00:00Z', { jobs: [manual('j4', 'Done', 'unblocked')] })] }) } as unknown as Auth
  await createBuilds(auth, async (j) => (asked.push(j.id), false)).list({ pipelines: [P] })
  assert.deepEqual(asked, [])
})

test('builds.list takes hasFields from the lookup for a blocked manual job', async () => {
  const auth = { request: async () => ({ ok: true, value: [bk(5, 'blocked', '2026-01-01T00:00:00Z', { jobs: [manual('j2', 'Go', 'blocked')] })] }) } as unknown as Auth
  const answer = await createBuilds(auth, async () => false).list({ pipelines: [P] })
  assert.equal(answer.ok && answer.value.builds[0].jobs[0].hasFields, false)
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

test('builds.list refuses a pipeline ref with a missing slug without calling Buildkite', async () => {
  const { answer, requests } = await list({}, { pipelines: [{ org: 'acme' } as never] })
  assert.deepEqual([!answer.ok && answer.error.message, requests.length], ["That pipeline isn't valid", 0])
})

test('builds.list refuses a pipeline ref with a null org without calling Buildkite', async () => {
  const { answer, requests } = await list({}, { pipelines: [{ org: null, slug: 'web' } as never] })
  assert.deepEqual([!answer.ok && answer.error.message, requests.length], ["That pipeline isn't valid", 0])
})

test('builds.list asks Buildkite once and returns each build once when a pipeline is repeated', async () => {
  const { answer, requests } = await list(
    { [path()]: { status: 200, json: [bk(2, 'passed', '2026-01-02T00:00:00Z')] } },
    { pipelines: [P, { ...P }] }
  )
  assert.deepEqual([numbers(answer), requests.length], [[2], 2])
})

test('builds.list answers token_invalid when another pipeline is unreachable', async () => {
  const other = { org: 'acme', slug: 'api' }
  const { answer } = await list(
    { [path()]: 'network-error', [path(other)]: { status: 401 } },
    { pipelines: [P, other] }
  )
  assert.equal(!answer.ok && answer.error.kind, 'token_invalid')
})

test('builds.list answers an empty list without throwing when the payload is null', async () => {
  const fake = installFakeBuildkite({})
  const worker = await mountWorker(main, { host: mockHost({ secrets: { token: FAKE_TOKEN } }) })
  try {
    const answer = (await worker.request('builds.list', null as never)) as Listed
    assert.deepEqual([numbers(answer), fake.requests.length], [[], 0])
  } finally {
    fake.restore()
    await worker.deactivate()
  }
})

test('builds.list refuses a null pipeline entry without calling Buildkite', async () => {
  const { answer, requests } = await list({}, { pipelines: [null as never] })
  assert.deepEqual([!answer.ok && answer.error.message, requests.length], ["That pipeline isn't valid", 0])
})

test('builds.list ignores a branch that is not a string', async () => {
  const { requests } = await list({ [path()]: { status: 200, json: [] } }, { pipelines: [P], branch: { x: 1 } as never })
  assert.deepEqual(requests.map((r) => r.url.includes('branch')), [false, false])
})
