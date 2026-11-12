// AC5: runs every worker flow with a known token and asserts it surfaces in no output.
// Add new flows (and their error paths) here as later tasks land.
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { createAuth } from './auth'
import * as main from './worker'
import { FAKE_TOKEN, installFakeBuildkite, validRoutes } from './testing/fake-buildkite'
import { createLeakHarness } from './testing/leak-harness'

async function run(routes: Parameters<typeof installFakeBuildkite>[0], flow: (call: (fn: () => Promise<unknown>) => Promise<unknown>, worker: Awaited<ReturnType<typeof mountWorker>>) => Promise<void>, host = mockHost()) {
  const fake = installFakeBuildkite(routes)
  const worker = await mountWorker(main, { host })
  const harness = createLeakHarness(FAKE_TOKEN, worker, host)
  try {
    await flow((fn) => harness.call(fn), worker)
  } finally {
    harness.assertClean()
    fake.restore()
    await worker.deactivate()
  }
}

test('token never leaks during sign-in, status, replace and sign-out', () =>
  run(validRoutes(), async (call, w) => {
    await call(() => w.request('auth.signIn', { token: FAKE_TOKEN }))
    await call(() => w.request('auth.status'))
    await call(() => w.request('auth.signIn', { token: `${FAKE_TOKEN}_new` }))
    await call(() => w.request('auth.signOut'))
  }))

test('token never leaks when Buildkite rejects the token at sign-in', () =>
  run({ 'GET /v2/access-token': { status: 401, json: { message: `bad ${FAKE_TOKEN}` } } }, async (call, w) => {
    await call(() => w.request('auth.signIn', { token: FAKE_TOKEN }))
  }))

test('token never leaks on a network error at sign-in', () =>
  run({ 'GET /v2/access-token': 'network-error' }, async (call, w) => {
    await call(() => w.request('auth.signIn', { token: FAKE_TOKEN }))
  }))

test('token never leaks on a server error at sign-in', () =>
  run({ 'GET /v2/access-token': { status: 500 } }, async (call, w) => {
    await call(() => w.request('auth.signIn', { token: FAKE_TOKEN }))
  }))

test('token never leaks when sign-in is rate limited', () =>
  run({ 'GET /v2/access-token': { status: 429, headers: { 'RateLimit-Reset': '5' } } }, async (call, w) => {
    await call(() => w.request('auth.signIn', { token: FAKE_TOKEN }))
  }))

test('token never leaks when the second validation call fails', () =>
  run({ 'GET /v2/access-token': { status: 200, json: { scopes: [] } }, 'GET /v2/user': { status: 403 } }, async (call, w) => {
    await call(() => w.request('auth.signIn', { token: FAKE_TOKEN }))
  }))

test('token never leaks when sign-in gets a non-string token', () =>
  run(validRoutes(), async (call, w) => {
    await call(() => (w.request as (m: string, p: unknown) => Promise<unknown>)('auth.signIn', { token: 123 }))
  }))

test('token never leaks when sign-in gets a null payload', () =>
  run(validRoutes(), async (call, w) => {
    await call(() => (w.request as (m: string, p: unknown) => Promise<unknown>)('auth.signIn', null))
  }))

// The harness itself must catch a leak, or the tests above prove nothing.
test('harness fails when the token reaches a log line', async () => {
  const host = mockHost()
  const worker = await mountWorker({ default: (orca) => orca.log(`oops ${FAKE_TOKEN}`) }, { host })
  const harness = createLeakHarness(FAKE_TOKEN, worker, host)
  assert.throws(() => harness.assertClean(), /token leaked into logs/)
  harness.restore()
  await worker.deactivate()
})

test('harness fails when the token reaches terminal output', async () => {
  const host = mockHost()
  const worker = await mountWorker(main, { host })
  const harness = createLeakHarness(FAKE_TOKEN, worker, host)
  console.error(`oops ${FAKE_TOKEN}`)
  assert.throws(() => harness.assertClean(), /token leaked into terminal/)
  await worker.deactivate()
})

test('harness fails when the token reaches non-secret storage', async () => {
  const host = mockHost({ storage: { leaked: FAKE_TOKEN } })
  const worker = await mountWorker(main, { host })
  const harness = createLeakHarness(FAKE_TOKEN, worker, host)
  assert.throws(() => harness.assertClean(), /token leaked into storage/)
  await worker.deactivate()
})

// Stored-token path (auth.request): the 401 flow deletes the secret and posts events.
const authedWorker = (orca: Parameters<typeof createAuth>[0]) => {
  const auth = createAuth(orca)
  orca.panels.handle('pipelines.visible', async () => auth.request('GET', '/v2/organizations') as never)
}
const runAuthed = (routes: Parameters<typeof installFakeBuildkite>[0], secrets: Record<string, string>) => {
  const fake = installFakeBuildkite(routes)
  const host = mockHost({ secrets })
  return mountWorker({ default: authedWorker }, { host }).then(async (worker) => {
    const harness = createLeakHarness(FAKE_TOKEN, worker, host)
    try {
      await harness.call(() => worker.request('pipelines.visible'))
    } finally {
      harness.assertClean()
      fake.restore()
      await worker.deactivate()
    }
  })
}

test('token never leaks when a stored token is rejected during normal use', () =>
  runAuthed({ 'GET /v2/organizations': { status: 401, json: { message: `bad ${FAKE_TOKEN}` } } }, { token: FAKE_TOKEN }))

test('token never leaks on a network error with a stored token', () =>
  runAuthed({ 'GET /v2/organizations': 'network-error' }, { token: FAKE_TOKEN }))

test('token never leaks on a successful request with a stored token', () =>
  runAuthed({ 'GET /v2/organizations': { status: 200, json: [] } }, { token: FAKE_TOKEN }))

// T4 actions with a stored token: success and every error path.
const AB = '/v2/organizations/acme/pipelines/web/builds/7'
const target = { org: 'acme', pipeline: 'web', number: 7 }
const runActions = (routes: Parameters<typeof installFakeBuildkite>[0], canWriteBuilds = true) => {
  const fake = installFakeBuildkite(routes)
  const host = mockHost({ secrets: { token: FAKE_TOKEN }, storage: { 'auth.profile': { user: { name: 'Ada' }, canWriteBuilds } } })
  return mountWorker(main, { host }).then(async (worker) => {
    const harness = createLeakHarness(FAKE_TOKEN, worker, host)
    const req = worker.request as (m: string, p: unknown) => Promise<unknown>
    try {
      await harness.call(() => req('builds.rebuild', target))
      await harness.call(() => req('builds.cancel', target))
      await harness.call(() => req('jobs.unblock', { ...target, jobId: 'j-1' }))
      await harness.call(() => req('builds.rebuild', { ...target, org: '../x' }))
    } finally {
      harness.assertClean()
      fake.restore()
      await worker.deactivate()
    }
  })
}
const blocked = { status: 200, json: { jobs: [{ id: 'j-1', graphql_id: 'Sm9iLS0tMQ==', type: 'manual', label: 'Deploy', state: 'blocked', unblockable: true }] } }

test('token never leaks when rebuild, cancel and unblock succeed', () =>
  runActions({
    [`PUT ${AB}/rebuild`]: { status: 201, json: { number: 8 } },
    [`PUT ${AB}/cancel`]: { status: 200 },
    [`GET ${AB}`]: blocked,
    [`PUT ${AB}/jobs/j-1/unblock`]: { status: 200 }
  }))

test('token never leaks when Buildkite refuses the actions', () =>
  runActions({
    [`PUT ${AB}/rebuild`]: { status: 403, json: { message: FAKE_TOKEN } },
    [`PUT ${AB}/cancel`]: { status: 403 },
    [`GET ${AB}`]: blocked,
    [`PUT ${AB}/jobs/j-1/unblock`]: { status: 403 }
  }))

test('token never leaks when the actions hit network errors', () =>
  runActions({
    [`PUT ${AB}/rebuild`]: 'network-error',
    [`PUT ${AB}/cancel`]: 'network-error',
    [`GET ${AB}`]: 'network-error'
  }))

test('token never leaks when the actions are rate limited or fail', () =>
  runActions({
    [`PUT ${AB}/rebuild`]: { status: 429, headers: { 'RateLimit-Reset': '3' } },
    [`PUT ${AB}/cancel`]: { status: 500 },
    [`GET ${AB}`]: { status: 404 }
  }))

test('token never leaks when the actions are refused for a token without write_builds', () => runActions({}, false))

test('token never leaks when the actions are rejected as 401', () =>
  runActions({ [`PUT ${AB}/rebuild`]: { status: 401, json: { message: FAKE_TOKEN } } }))
