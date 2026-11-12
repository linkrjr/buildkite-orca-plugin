// AC5: runs every worker flow with a known token and asserts it surfaces in no output.
// Add new flows (and their error paths) here as later tasks land.
import { assert, mockHost, mountWorker, test } from 'orca/testing'
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
