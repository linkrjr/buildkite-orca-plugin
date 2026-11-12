import { assert, mockHost, mount, test } from 'orca/testing'
import type { AuthState, Pipeline, Project, Result } from './protocol'
import * as panel from './panel'

const signedIn: AuthState = { state: 'signedIn', user: { name: 'Ana' }, canWriteBuilds: true }
const pl = (org: string, slug: string): Pipeline => ({
  org,
  slug,
  orgName: org.toUpperCase(),
  name: slug,
  repository: `git@github.com:${org}/${slug}.git`,
  webUrl: `https://buildkite.com/${org}/${slug}`
})
const web = pl('acme', 'web')
const api = pl('acme', 'api')
const ops = pl('ops', 'infra')
const ws = (id = 'ws-1', remote: string | null = 'git@github.com:acme/web.git') => ({ id, path: '/p', remote, branch: 'main' })
const proj = (p: Partial<Project>): Project => ({ workspace: ws(), source: 'auto', pipelines: [web], ...p })
const has = (view: { tree(): unknown }, text: string) => JSON.stringify(view.tree()).includes(text)

function host(get: () => Project, extra: Record<string, (p: never) => unknown> = {}, visible: Pipeline[] = [web, api, ops]) {
  return mockHost({
    requests: {
      'auth.status': () => signedIn,
      'project.get': () => ({ ok: true, value: get() }) as Result<Project>,
      'pipelines.visible': () => ({ ok: true, value: visible }),
      ...extra
    } as never
  })
}

test('no active workspace shows the open-a-workspace state, and follows project.changed (AC26)', async () => {
  const view = await mount(panel, { host: host(() => proj({ workspace: null, pipelines: [], source: 'none' })) })
  assert.ok(has(view, 'Open a workspace to see its Buildkite builds.'))
  await view.post('project.changed', proj({ workspace: ws('ws-2'), pipelines: [api] }))
  assert.ok(!has(view, 'Open a workspace'))
  assert.ok(has(view, 'automatic match'))
  assert.deepEqual(view.errors, [])
  await view.unmount()
})

test('no match: shows the remote, a picker grouped by org, and saves the choice (AC9, AC10)', async () => {
  const chosen: unknown[] = []
  const h = host(() => proj({ source: 'none', pipelines: [] }), {
    'project.choose': (p: never) => {
      chosen.push(p)
      return { ok: true, value: proj({ source: 'manual', pipelines: [api, ops] }) }
    }
  })
  const view = await mount(panel, { host: h })
  assert.ok(has(view, 'No Buildkite pipeline matches this project'))
  assert.ok(has(view, 'git@github.com:acme/web.git'))
  assert.ok(has(view, 'ACME') && has(view, 'OPS'))
  assert.equal(view.find({ text: /Show builds \(0\)/ })?.props?.disabled, true)
  await view.type({ label: 'Search pipelines' }, 'infra')
  assert.ok(!view.find({ label: 'api' }))
  await view.toggle({ label: 'infra' })
  await view.type({ label: 'Search pipelines' }, 'api', { replace: true })
  await view.toggle({ label: 'api' })
  await view.press({ text: 'Show builds (2)' })
  assert.deepEqual(chosen, [
    { workspaceId: 'ws-1', pipelines: [{ org: 'acme', slug: 'api' }, { org: 'ops', slug: 'infra' }] }
  ])
  assert.ok(has(view, 'chosen manually'))
  assert.ok(!has(view, 'No Buildkite pipeline matches'))
  await view.unmount()
})

test('no remote and nothing visible', async () => {
  const view = await mount(panel, {
    host: host(() => proj({ source: 'none', pipelines: [], workspace: ws('ws-1', null) }), {}, [])
  })
  assert.ok(has(view, 'This workspace has no git remote'))
  assert.ok(has(view, "Your token can't see any pipelines."))
  assert.ok(!view.find({ label: 'Search pipelines' }))
  await view.unmount()
})

test('unresolvable workspace id: message instead of a picker, nothing stored', async () => {
  const h = host(() => proj({ source: 'none', pipelines: [], workspace: ws('') }))
  const view = await mount(panel, { host: h })
  assert.ok(has(view, "can't be saved"))
  assert.ok(!view.find({ label: 'Search pipelines' }))
  assert.equal(h.callsOf('pipelines.visible').length, 0)
  await view.unmount()

  const view2 = await mount(panel, {
    host: host(() => proj({ workspace: ws(''), pipelines: [web, api] }))
  })
  assert.ok(!view2.find({ text: 'Change pipelines' }))
  await view2.select({ label: 'Pipeline' }, 'acme/api')
  assert.deepEqual(view2.persisted.storage, {})
  await view2.unmount()
})

test('change pipelines preselects the current set; reset goes back to automatic matching (AC11)', async () => {
  const chosen: unknown[] = []
  const h = host(() => proj({ source: 'manual', pipelines: [api] }), {
    'project.choose': (p: never) => {
      chosen.push(p)
      return { ok: true, value: proj({ source: 'auto', pipelines: [web] }) }
    }
  })
  const view = await mount(panel, { host: h })
  assert.ok(has(view, 'chosen manually'))
  await view.press({ text: 'Change pipelines' })
  assert.equal(view.valueOf({ label: 'api' }), true)
  assert.equal(view.valueOf({ label: 'web' }), false)
  await view.press({ text: 'Use automatic matching' })
  assert.deepEqual(chosen, [{ workspaceId: 'ws-1', pipelines: null }])
  assert.ok(has(view, 'automatic match'))
  await view.press({ text: 'Change pipelines' })
  await view.press({ text: 'Cancel' })
  assert.ok(view.find({ text: 'Change pipelines' }))
  await view.unmount()
})

test('a failed save shows the error and keeps the picker', async () => {
  const view = await mount(panel, {
    host: host(() => proj({ source: 'none', pipelines: [] }), {
      'project.choose': () => ({ ok: false, error: { kind: 'buildkite_error', message: 'Buildkite returned an error (500)' } })
    })
  })
  await view.toggle({ label: 'web' })
  await view.press({ text: 'Show builds (1)' })
  assert.ok(has(view, 'Buildkite returned an error (500)'))
  assert.ok(view.find({ label: 'Search pipelines' }))
  await view.unmount()
})

test('pipeline filter only with several pipelines, remembered per workspace (AC13, AC26)', async () => {
  const one = await mount(panel, { host: host(() => proj({})) })
  assert.ok(!one.find({ label: 'Pipeline' }))
  await one.unmount()

  const h = host(() => proj({ pipelines: [web, api] }))
  const view = await mount(panel, { host: h })
  assert.ok(view.find({ label: 'Pipeline' }))
  assert.ok(has(view, 'All matching pipelines'))
  await view.select({ label: 'Pipeline' }, 'acme/api')
  assert.deepEqual(view.persisted.storage, { 'panel.prefs': { 'ws-1': { pipeline: 'acme/api' } } })
  // Another workspace has its own (unset) filter; coming back restores this one.
  await view.post('project.changed', proj({ workspace: ws('ws-2'), pipelines: [web, api] }))
  assert.equal(view.valueOf({ label: 'Pipeline' }), 'all')
  await view.post('project.changed', proj({ pipelines: [web, api] }))
  assert.equal(view.valueOf({ label: 'Pipeline' }), 'acme/api')
  // A stored pipeline that no longer matches falls back to all.
  await view.post('project.changed', proj({ pipelines: [web, ops] }))
  assert.equal(view.valueOf({ label: 'Pipeline' }), 'all')
  await view.unmount()
})

test('selectedPipelines follows the filter', async () => {
  const mod = await import('./project-view')
  const view = await mount(panel, { host: host(() => proj({ pipelines: [web, api] })) })
  const { read } = await import('orca')
  assert.equal(read(mod.selectedPipelines).length, 2)
  await view.select({ label: 'Pipeline' }, 'acme/api')
  assert.deepEqual(read(mod.selectedPipelines).map((p) => p.slug), ['api'])
  await view.unmount()
})

test('sign out clears the project', async () => {
  const view = await mount(panel, { host: host(() => proj({}), { 'auth.signOut': () => ({ state: 'signedOut' }) }) })
  await view.press({ label: 'Account' })
  await view.press({ text: 'Sign out' })
  assert.ok(!has(view, 'automatic match'))
  await view.unmount()
})
