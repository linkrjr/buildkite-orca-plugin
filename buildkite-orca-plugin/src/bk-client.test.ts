import { assert, test } from 'orca/testing'
import { bkRequest } from './bk-client'
import { FAKE_TOKEN, installFakeBuildkite } from './testing/fake-buildkite'

test('sends the token only in an Authorization Bearer header to https://api.buildkite.com', async () => {
  const fake = installFakeBuildkite({ 'GET /v2/user': { status: 200, json: { name: 'A' } } })
  await bkRequest(FAKE_TOKEN, 'GET', '/v2/user')
  const [req] = fake.requests
  assert.equal(req.url, 'https://api.buildkite.com/v2/user')
  assert.equal(req.headers.Authorization, `Bearer ${FAKE_TOKEN}`)
  assert.equal(req.url.includes(FAKE_TOKEN), false)
  fake.restore()
})

test('returns the parsed JSON body on success', async () => {
  const fake = installFakeBuildkite({ 'GET /v2/user': { status: 200, json: { name: 'A' } } })
  assert.deepEqual(await bkRequest(FAKE_TOKEN, 'GET', '/v2/user'), { ok: true, value: { name: 'A' } })
  fake.restore()
})

const kindFor = async (status: number, headers?: Record<string, string>) => {
  const fake = installFakeBuildkite({ 'GET /v2/x': { status, headers } })
  const result = await bkRequest(FAKE_TOKEN, 'GET', '/v2/x')
  fake.restore()
  return result
}

test('maps 401 to token_invalid', async () => {
  const r = await kindFor(401)
  assert.equal(!r.ok && r.error.kind, 'token_invalid')
})
test('maps 403 to forbidden with the status', async () => {
  const r = await kindFor(403)
  assert.equal(!r.ok && r.error.kind, 'forbidden')
  assert.equal(!r.ok && r.error.status, 403)
})
test('maps 404 to not_found', async () => {
  const r = await kindFor(404)
  assert.equal(!r.ok && r.error.kind, 'not_found')
})
test('maps 429 to rate_limited with retryAfterSec from RateLimit-Reset', async () => {
  const r = await kindFor(429, { 'RateLimit-Reset': '12' })
  assert.equal(!r.ok && r.error.kind, 'rate_limited')
  assert.equal(!r.ok && r.error.retryAfterSec, 12)
})
test('maps 500 to buildkite_error with the status', async () => {
  const r = await kindFor(500)
  assert.equal(!r.ok && r.error.kind, 'buildkite_error')
  assert.equal(!r.ok && r.error.status, 500)
})
test('maps a fetch failure to network with a message that omits the token', async () => {
  const fake = installFakeBuildkite({ 'GET /v2/x': 'network-error' })
  const r = await bkRequest(FAKE_TOKEN, 'GET', '/v2/x')
  fake.restore()
  assert.equal(!r.ok && r.error.kind, 'network')
  assert.equal(JSON.stringify(r).includes(FAKE_TOKEN), false)
})
