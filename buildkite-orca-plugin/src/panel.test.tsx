// `orca plugin test .` runs this in Node with the same runtime and checks Orca uses.
import { assert, mockHost, mount, test } from 'orca/testing'
import type { AuthState, Result } from './protocol'
import * as panel from './panel'

const TOKEN = 'bkua_fake_panel_token_123'
const NEW_TOKEN = 'bkua_fake_new_token_456'
const signedOut: AuthState = { state: 'signedOut' }
const signedIn = (name: string): AuthState => ({ state: 'signedIn', user: { name }, canWriteBuilds: true })

function host(initial: AuthState, signIn: (token: string) => Result<AuthState> | Promise<Result<AuthState>>) {
  const state = { current: initial }
  const h = mockHost({
    requests: {
      'auth.status': () => state.current,
      'auth.signIn': ({ token }) => signIn(token),
      'auth.signOut': () => (state.current = signedOut)
    }
  })
  return h
}
const rejected = (): Result<AuthState> => ({ ok: false, error: { kind: 'token_invalid', message: 'Buildkite rejected this token' } })
// Callout titles are not text nodes; the rendered tree holds them as props.
const has = (view: { tree(): unknown }, text: string) => JSON.stringify(view.tree()).includes(text)
const requestsOf = (h: ReturnType<typeof host>) => h.calls.map((c) => JSON.stringify(c))

test('signed out: shows the masked token form and scopes note, requests no builds (AC1)', async () => {
  const h = host(signedOut, rejected)
  const view = await mount(panel, { host: h })
  assert.ok(view.find({ label: 'Buildkite API token' }))
  assert.ok(view.find({ text: /read access to user, organizations, pipelines and builds/ }))
  assert.ok(view.find({ text: 'Sign in' }))
  assert.equal(view.find({ label: 'Buildkite API token' })?.props?.type, 'password')
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  assert.ok(!requestsOf(h).some((c) => /builds|project|pipelines/.test(c)))
  await view.unmount()
})

test('valid token signs in and shows "Signed in as <name>"; the field holds nothing after (AC2, AC4)', async () => {
  const h = host(signedOut, () => ({ ok: true, value: signedIn('Ana Souza') }))
  const view = await mount(panel, { host: h })
  await view.type({ label: 'Buildkite API token' }, TOKEN)
  await view.press({ text: 'Sign in' })
  assert.ok(view.find({ text: /Signed in as/ })?.text.includes('Ana Souza'))
  assert.ok(!view.find({ label: 'Buildkite API token' }))
  assert.ok(!JSON.stringify(view.tree()).includes(TOKEN))
  assert.deepEqual(view.persisted, { plugin: {}, workspace: {}, storage: {} })
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})

test('rejected token shows "Buildkite rejected this token" and clears the field (AC3)', async () => {
  const view = await mount(panel, { host: host(signedOut, rejected) })
  await view.type({ label: 'Buildkite API token' }, TOKEN)
  await view.press({ text: 'Sign in' })
  assert.ok(view.find({ text: 'Buildkite rejected this token' }))
  assert.equal(view.valueOf({ label: 'Buildkite API token' }), '')
  assert.ok(!JSON.stringify(view.tree()).includes(TOKEN))
  await view.unmount()
})

test('Enter in the field submits', async () => {
  const view = await mount(panel, { host: host(signedOut, () => ({ ok: true, value: signedIn('Ana') })) })
  await view.type({ label: 'Buildkite API token' }, TOKEN, { submit: true })
  assert.ok(view.find({ text: /Signed in as/ }))
  await view.unmount()
})

test('network failure and storage failure show their callouts and clear the field', async () => {
  const view = await mount(panel, {
    host: host(signedOut, () => ({ ok: false, error: { kind: 'network', message: 'x' } }))
  })
  await view.type({ label: 'Buildkite API token' }, TOKEN, { submit: true })
  assert.ok(has(view, "Can't reach Buildkite"))
  assert.equal(view.valueOf({ label: 'Buildkite API token' }), '')
  await view.unmount()

  const view2 = await mount(panel, {
    host: host(signedOut, () => ({ ok: false, error: { kind: 'buildkite_error', message: "Couldn't save the token" } }))
  })
  await view2.type({ label: 'Buildkite API token' }, TOKEN, { submit: true })
  assert.ok(has(view2, "Couldn't save the token"))
  await view2.unmount()
})

test('Sign out returns to the form (AC7)', async () => {
  const view = await mount(panel, { host: host(signedIn('Ana'), rejected) })
  await view.press({ label: 'Account' })
  await view.press({ text: 'Sign out' })
  assert.ok(view.find({ label: 'Buildkite API token' }))
  assert.ok(!view.find({ text: /Signed in as/ }))
  await view.unmount()
})

test('Replace token: empty field, success switches the name, rejection keeps the signed-in view (AC4, AC7)', async () => {
  const view = await mount(panel, {
    host: host(signedIn('Ana'), (t) => (t === NEW_TOKEN ? { ok: true, value: signedIn('Bia') } : rejected()))
  })
  await view.press({ label: 'Account' })
  await view.press({ text: 'Replace token' })
  assert.equal(view.valueOf({ label: 'New Buildkite API token' }), '')

  await view.type({ label: 'New Buildkite API token' }, TOKEN, { submit: true })
  assert.ok(view.find({ text: 'Buildkite rejected this token' }))
  assert.ok(has(view, 'Your current token is still in use'))
  assert.equal(view.valueOf({ label: 'New Buildkite API token' }), '')

  await view.type({ label: 'New Buildkite API token' }, NEW_TOKEN)
  await view.press({ text: 'Validate and replace' })
  assert.ok(view.find({ text: /Signed in as/ })?.text.includes('Bia'))
  assert.ok(!view.find({ label: 'New Buildkite API token' }))

  // Cancel closes it and the next open is empty.
  await view.press({ label: 'Account' })
  await view.press({ text: 'Replace token' })
  await view.press({ text: 'Cancel' })
  assert.ok(!view.find({ label: 'New Buildkite API token' }))
  assert.deepEqual(view.persisted, { plugin: {}, workspace: {}, storage: {} })
  await view.unmount()
})

test('auth.changed with token_rejected shows the form with the warning (AC25); signedIn event updates the header', async () => {
  const view = await mount(panel, { host: host(signedIn('Ana'), rejected) })
  await view.post('auth.changed', { state: 'signedOut', reason: 'token_rejected' })
  assert.ok(has(view, 'Your Buildkite token is no longer valid'))
  assert.ok(view.find({ label: 'Buildkite API token' }))
  await view.post('auth.changed', signedIn('Cy'))
  assert.ok(view.find({ text: /Signed in as/ })?.text.includes('Cy'))
  assert.ok(!has(view, 'Your Buildkite token is no longer valid'))
  await view.unmount()
})

test('no counter UI remains (AC27)', async () => {
  const view = await mount(panel, { host: host(signedOut, rejected) })
  assert.ok(!view.find({ text: /Counter/ }))
  await view.unmount()
})
