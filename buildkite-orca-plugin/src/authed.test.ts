import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { createAuth } from './auth'
import { FAKE_TOKEN, installFakeBuildkite } from './testing/fake-buildkite'
import * as main from './worker'

// A 401 on a stored token during normal use (AC25), through the authenticated client later tasks use.
test('authed request on a rejected stored token deletes it, answers token_invalid and posts signedOut', async () => {
  const fake = installFakeBuildkite({ 'GET /v2/organizations': { status: 401 } })
  const host = mockHost({ secrets: { token: FAKE_TOKEN } })
  const worker = await mountWorker({ default: (orca) => {
    const auth = createAuth(orca)
    orca.panels.handle('auth.status', () => auth.status())
    orca.panels.handle('pipelines.visible', async () => auth.request('GET', '/v2/organizations') as never)
  } }, { host })
  const answer = await worker.request('pipelines.visible')
  assert.equal(!(answer as any).ok && (answer as any).error.kind, 'token_invalid')
  assert.deepEqual(host.data().secrets, {})
  assert.deepEqual(worker.posts, [{ event: 'auth.changed', payload: { state: 'signedOut', reason: 'token_rejected' } }])
  fake.restore()
  await worker.deactivate()
})

test('authed request without a stored token answers token_invalid and calls nothing', async () => {
  const fake = installFakeBuildkite({})
  const host = mockHost()
  let result: unknown
  await mountWorker({ default: async (orca) => { result = await createAuth(orca).request('GET', '/v2/user') } }, { host })
  assert.equal((result as any).error.kind, 'token_invalid')
  assert.deepEqual(fake.requests, [])
  fake.restore()
})
void main
