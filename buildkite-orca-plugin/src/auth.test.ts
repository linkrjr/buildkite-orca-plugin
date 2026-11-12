import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { createAuth } from './auth'
import * as main from './worker'
import { FAKE_TOKEN, installFakeBuildkite, validRoutes } from './testing/fake-buildkite'

async function setup(options: Parameters<typeof mockHost>[0] = {}, routes = validRoutes()) {
  const fake = installFakeBuildkite(routes)
  const host = mockHost(options)
  const worker = await mountWorker(main, { host })
  return { fake, host, worker, done: async () => { fake.restore(); await worker.deactivate() } }
}

test('auth.status is signedOut when no token is stored', async () => {
  const { worker, done } = await setup()
  assert.deepEqual(await worker.request('auth.status'), { state: 'signedOut' })
  await done()
})

test('auth.signIn validates, stores the token as a secret and answers the user name', async () => {
  const { worker, host, done } = await setup()
  const answer = await worker.request('auth.signIn', { token: FAKE_TOKEN })
  assert.deepEqual(answer, {
    ok: true,
    value: { state: 'signedIn', user: { name: 'Ada Lovelace', email: 'ada@example.com' }, canWriteBuilds: true }
  })
  assert.equal(Object.values(host.data().secrets).includes(FAKE_TOKEN), true)
  await done()
})

test('auth.signIn reports canWriteBuilds false when the token lacks write_builds', async () => {
  const { worker, done } = await setup({}, validRoutes(['read_builds']))
  const answer = await worker.request('auth.signIn', { token: FAKE_TOKEN })
  assert.equal(answer.ok && answer.value.state === 'signedIn' && answer.value.canWriteBuilds, false)
  await done()
})

test('auth.signIn posts auth.changed with the signedIn state', async () => {
  const { worker, done } = await setup()
  await worker.request('auth.signIn', { token: FAKE_TOKEN })
  assert.deepEqual(worker.posts.map((p) => p.event), ['auth.changed'])
  assert.equal((worker.posts[0].payload as { state: string }).state, 'signedIn')
  await done()
})

test('auth.status is signedIn after signing in, without calling Buildkite again', async () => {
  const { worker, fake, done } = await setup()
  await worker.request('auth.signIn', { token: FAKE_TOKEN })
  const before = fake.requests.length
  const status = await worker.request('auth.status')
  assert.equal(status.state, 'signedIn')
  assert.equal(fake.requests.length, before)
  await done()
})

test('auth.signIn with a rejected token answers token_invalid and stores nothing', async () => {
  const { worker, host, done } = await setup({}, { 'GET /v2/access-token': { status: 401 } })
  const answer = await worker.request('auth.signIn', { token: FAKE_TOKEN })
  assert.equal(!answer.ok && answer.error.kind, 'token_invalid')
  assert.deepEqual(host.data().secrets, {})
  assert.deepEqual(worker.posts, [])
  await done()
})

test('auth.signIn with a rejected new token keeps the old token', async () => {
  const { worker, host, fake, done } = await setup()
  await worker.request('auth.signIn', { token: FAKE_TOKEN })
  fake.restore()
  const fake2 = installFakeBuildkite({ 'GET /v2/access-token': { status: 401 } })
  await worker.request('auth.signIn', { token: 'bkua_other' })
  assert.equal(Object.values(host.data().secrets).includes(FAKE_TOKEN), true)
  assert.equal((await worker.request('auth.status')).state, 'signedIn')
  fake2.restore()
  await worker.deactivate()
})

test('auth.signIn replaces the old token when the new one validates', async () => {
  const { worker, host, done } = await setup()
  await worker.request('auth.signIn', { token: FAKE_TOKEN })
  await worker.request('auth.signIn', { token: 'bkua_second' })
  assert.deepEqual(Object.values(host.data().secrets), ['bkua_second'])
  await done()
})

test('auth.signIn answers network when Buildkite cannot be reached', async () => {
  const { worker, done } = await setup({}, { 'GET /v2/access-token': 'network-error' })
  const answer = await worker.request('auth.signIn', { token: FAKE_TOKEN })
  assert.equal(!answer.ok && answer.error.kind, 'network')
  await done()
})

test('auth.signIn answers token_invalid for a blank token without calling Buildkite', async () => {
  const { worker, fake, done } = await setup()
  const answer = await worker.request('auth.signIn', { token: '   ' })
  assert.equal(!answer.ok && answer.error.kind, 'token_invalid')
  assert.deepEqual(fake.requests, [])
  await done()
})

test('auth.signOut deletes the stored token and posts signedOut', async () => {
  const { worker, host, done } = await setup()
  await worker.request('auth.signIn', { token: FAKE_TOKEN })
  const answer = await worker.request('auth.signOut')
  assert.deepEqual(answer, { state: 'signedOut' })
  assert.deepEqual(host.data().secrets, {})
  assert.deepEqual(await worker.request('auth.status'), { state: 'signedOut' })
  assert.deepEqual(worker.posts.at(-1), { event: 'auth.changed', payload: { state: 'signedOut' } })
  await done()
})

test('auth.signIn answers token_invalid for a token with a newline without calling Buildkite', async () => {
  const { worker, fake, done } = await setup()
  const answer = await worker.request('auth.signIn', { token: 'abc\ndef' })
  assert.equal(!answer.ok && answer.error.kind, 'token_invalid')
  assert.deepEqual(fake.requests, [])
  await done()
})

test('auth.signIn answers token_invalid for a token with a non-Latin-1 character without calling Buildkite', async () => {
  const { worker, fake, done } = await setup()
  const answer = await worker.request('auth.signIn', { token: 'abc\u2603' })
  assert.equal(!answer.ok && answer.error.kind, 'token_invalid')
  assert.deepEqual(fake.requests, [])
  await done()
})

test('auth.signIn removes the new token and answers an error when saving the profile fails', async () => {
  const fake = installFakeBuildkite(validRoutes())
  const host = mockHost()
  const worker = await mountWorker({ default: (orca) => {
    const failing = { ...orca, storage: { ...orca.storage, set: async () => { throw new Error('disk full') } } } as typeof orca
    const auth = createAuth(failing)
    orca.panels.handle('auth.signIn', ({ token }: { token: string }) => auth.signIn(token) as never)
  } }, { host })
  const answer = (await worker.request('auth.signIn', { token: FAKE_TOKEN })) as { ok: boolean }
  assert.equal(answer.ok, false)
  assert.deepEqual(host.data().secrets, {})
  fake.restore()
  await worker.deactivate()
})

test('auth.signIn restores the old token when saving the profile fails during replace', async () => {
  const fake = installFakeBuildkite(validRoutes())
  const host = mockHost({ secrets: { token: 'old_token' } })
  const worker = await mountWorker({ default: (orca) => {
    const failing = { ...orca, storage: { ...orca.storage, set: async () => { throw new Error('disk full') } } } as typeof orca
    const auth = createAuth(failing)
    orca.panels.handle('auth.signIn', ({ token }: { token: string }) => auth.signIn(token) as never)
  } }, { host })
  await worker.request('auth.signIn', { token: FAKE_TOKEN })
  assert.deepEqual(host.data().secrets, { token: 'old_token' })
  fake.restore()
  await worker.deactivate()
})
