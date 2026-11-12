// T4: rebuild, cancel and unblock (AC19-AC22, worker side).
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'
import { FAKE_TOKEN, installFakeBuildkite, validRoutes, type FakeRoutes } from './testing/fake-buildkite'

const B = '/v2/organizations/acme/pipelines/web/builds/7'
const PROFILE = { user: { name: 'Ada' }, canWriteBuilds: true }

async function setup(routes: FakeRoutes, canWriteBuilds = true) {
  const fake = installFakeBuildkite({ ...validRoutes(), ...routes })
  const host = mockHost({ secrets: { token: FAKE_TOKEN }, storage: { 'auth.profile': { ...PROFILE, canWriteBuilds } } })
  const worker = await mountWorker(main, { host })
  const req = worker.request as (m: string, p: unknown) => Promise<any>
  return { fake, worker, req, done: async () => { fake.restore(); await worker.deactivate() } }
}
const target = { org: 'acme', pipeline: 'web', number: 7 }

test('rebuild PUTs the build rebuild endpoint and answers the new build number', async () => {
  const s = await setup({ [`PUT ${B}/rebuild`]: { status: 201, json: { number: 8 } } })
  assert.deepEqual(await s.req('builds.rebuild', target), { ok: true, value: { number: 8 } })
  assert.equal(s.fake.requests.at(-1)?.method, 'PUT')
  await s.done()
})

test('cancel PUTs the build cancel endpoint and answers an empty value', async () => {
  const s = await setup({ [`PUT ${B}/cancel`]: { status: 200, json: { number: 7 } } })
  assert.deepEqual(await s.req('builds.cancel', target), { ok: true, value: {} })
  await s.done()
})

test('unblock PUTs the job unblock endpoint when the block step has no fields', async () => {
  const s = await setup({
    [`GET ${B}`]: { status: 200, json: { jobs: [{ id: 'j-1', type: 'manual', state: 'blocked' }] } },
    [`PUT ${B}/jobs/j-1/unblock`]: { status: 200, json: {} }
  })
  assert.deepEqual(await s.req('jobs.unblock', { ...target, jobId: 'j-1' }), { ok: true, value: {} })
  await s.done()
})

test('unblock refuses a block step with input fields and does not call unblock', async () => {
  const s = await setup({
    [`GET ${B}`]: { status: 200, json: { jobs: [{ id: 'j-1', type: 'manual', state: 'blocked', fields: [{ key: 'a' }] }] } }
  })
  const answer = await s.req('jobs.unblock', { ...target, jobId: 'j-1' })
  assert.equal(answer.ok, false)
  assert.equal(s.fake.requests.some((r) => r.method === 'PUT'), false)
  await s.done()
})

test('unblock answers not_found when the job is not in the build', async () => {
  const s = await setup({ [`GET ${B}`]: { status: 200, json: { jobs: [] } } })
  const answer = await s.req('jobs.unblock', { ...target, jobId: 'j-1' })
  assert.equal(answer.error.kind, 'not_found')
  await s.done()
})

test('rebuild answers forbidden naming the pipeline when Buildkite refuses', async () => {
  const s = await setup({ [`PUT ${B}/rebuild`]: { status: 403 } })
  const answer = await s.req('builds.rebuild', target)
  assert.equal(answer.error.kind, 'forbidden')
  assert.equal(answer.error.pipeline, 'web')
  assert.equal(answer.error.message, "You don't have permission to do this on web")
  await s.done()
})

test('a refused action is not retried', async () => {
  const s = await setup({ [`PUT ${B}/cancel`]: { status: 403 } })
  await s.req('builds.cancel', target)
  assert.equal(s.fake.requests.filter((r) => r.method === 'PUT').length, 1)
  await s.done()
})

test('unblock answers forbidden naming the pipeline when Buildkite refuses', async () => {
  const s = await setup({
    [`GET ${B}`]: { status: 200, json: { jobs: [{ id: 'j-1', type: 'manual', state: 'blocked' }] } },
    [`PUT ${B}/jobs/j-1/unblock`]: { status: 403 }
  })
  const answer = await s.req('jobs.unblock', { ...target, jobId: 'j-1' })
  assert.equal(answer.error.message, "You don't have permission to do this on web")
  await s.done()
})

test('actions answer forbidden without calling Buildkite when the token lacks write_builds', async () => {
  const s = await setup({}, false)
  const answer = await s.req('builds.rebuild', target)
  assert.equal(answer.error.kind, 'forbidden')
  assert.equal(s.fake.requests.length, 0)
  await s.done()
})

test('action answers token_invalid when Buildkite rejects the stored token', async () => {
  const s = await setup({ [`PUT ${B}/cancel`]: { status: 401 } })
  const answer = await s.req('builds.cancel', target)
  assert.equal(answer.error.kind, 'token_invalid')
  await s.done()
})

test('action answers a network error as network', async () => {
  const s = await setup({ [`PUT ${B}/cancel`]: 'network-error' })
  assert.equal((await s.req('builds.cancel', target)).error.kind, 'network')
  await s.done()
})

for (const [name, bad] of [
  ['an org with a path separator', { ...target, org: 'acme/../x' }],
  ['a pipeline with a query', { ...target, pipeline: 'web?x=1' }],
  ['a pipeline with a fragment', { ...target, pipeline: 'web#x' }],
  ['a non-integer number', { ...target, number: 1.5 }],
  ['a non-numeric number', { ...target, number: '7/cancel' }],
  ['a missing payload', null]
] as const) {
  test(`rebuild rejects ${name} without calling Buildkite`, async () => {
    const s = await setup({})
    const answer = await s.req('builds.rebuild', bad)
    assert.equal(answer.ok, false)
    assert.equal(s.fake.requests.length, 0)
    await s.done()
  })
}

test('unblock rejects a job id that could alter the path without calling Buildkite', async () => {
  const s = await setup({})
  const answer = await s.req('jobs.unblock', { ...target, jobId: '../cancel' })
  assert.equal(answer.ok, false)
  assert.equal(s.fake.requests.length, 0)
  await s.done()
})
