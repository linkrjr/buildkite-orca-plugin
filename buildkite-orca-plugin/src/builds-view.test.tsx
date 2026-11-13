import { mock } from 'node:test'
import { assert, mockHost, mount, test } from 'orca/testing'
import type { AuthState, Build, BkError, Pipeline, Project, Result } from './protocol'
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
const ws = (branch: string | null = 'feat/x', id = 'ws-1') => ({ id, path: '/p', remote: 'r', branch })
const proj = (p: Partial<Project> = {}): Project => ({ workspace: ws(), source: 'auto', pipelines: [web], ...p })
const build = (n: number, over: Partial<Build> = {}): Build => ({
  org: 'acme',
  pipelineSlug: 'web',
  pipelineName: 'web',
  number: n,
  state: 'passed',
  branch: 'main',
  message: `Commit ${n}`,
  author: 'Bia',
  createdAt: '2026-11-13T10:00:00Z',
  startedAt: '2026-11-13T10:00:05Z',
  finishedAt: '2026-11-13T10:04:56Z',
  webUrl: `https://buildkite.com/acme/web/builds/${n}`,
  jobs: [
    { id: `j${n}`, type: 'script', name: 'Run tests', state: 'passed', unblockable: false, hasFields: false },
    { id: `b${n}`, type: 'manual', name: 'Deploy', state: 'blocked', unblockable: true, hasFields: true }
  ],
  ...over
})
const has = (view: { tree(): unknown }, text: string) => JSON.stringify(view.tree()).includes(text)
type Answer = Result<{ builds: Build[]; fetchedAt: string }>
const ok = (builds: Build[], fetchedAt = '2026-11-13T10:05:00Z'): Answer => ({ ok: true, value: { builds, fetchedAt } })
const fail = (error: BkError): Answer => ({ ok: false, error })

function setup(project: () => Project, answer: (input: any, n: number) => Answer) {
  const inputs: any[] = []
  const host = mockHost({
    requests: {
      'auth.status': () => signedIn,
      'project.get': () => ({ ok: true, value: project() }),
      'builds.list': (input: any) => {
        inputs.push(input)
        return answer(input, inputs.length)
      }
    } as never
  })
  return { host, inputs }
}

test('first load shows a skeleton, then rows in worker order with the AC15 details (AC12, AC15, AC23)', async () => {
  const s = setup(() => proj(), () => ok([build(2, { state: 'running', finishedAt: null }), build(1, { branch: 'feat/y' })]))
  const view = await mount(panel, { host: s.host })
  assert.deepEqual(s.inputs, [{ pipelines: [{ org: 'acme', slug: 'web' }] }])
  assert.ok(!has(view, 'Loading builds'))
  assert.ok(has(view, '#2') && has(view, '#1'))
  assert.ok(JSON.stringify(view.tree()).indexOf('#2') < JSON.stringify(view.tree()).indexOf('#1'))
  for (const t of ['running', 'passed', 'acme/web', 'Commit 1', 'Bia', 'feat/y', '4m 51s']) assert.ok(has(view, t), t)
  assert.ok(view.find({ label: 'Open build #1 in Buildkite' }))
  await view.press({ label: 'Open build #1 in Buildkite' })
  assert.deepEqual(s.host.callsOf('shell.openExternal'), [{ url: 'https://buildkite.com/acme/web/builds/1' }])
  assert.deepEqual(view.errors, [])
  await view.unmount()
})

test('loading state while a request is pending, e.g. right after a workspace switch (AC23)', async () => {
  let release: (a: Answer) => void = () => {}
  const s = setup(() => proj(), (_i, n) => (n === 1 ? ok([build(1)]) : (undefined as never)))
  const gate = new Promise<Answer>((r) => (release = r))
  const host = mockHost({
    requests: {
      'auth.status': () => signedIn,
      'project.get': () => ({ ok: true, value: proj() }),
      'builds.list': (_i: any) => (s.inputs.push(_i), s.inputs.length === 1 ? ok([build(1)]) : gate)
    } as never
  })
  const view = await mount(panel, { host })
  assert.ok(!has(view, 'Loading builds'))
  const posting = view.post('project.changed', proj({ workspace: ws('main', 'ws-2') }))
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(has(view, 'Loading builds'))
  assert.ok(!has(view, '#1'), 'never shows the previous workspace')
  release(ok([build(7)]))
  await posting
  assert.ok(!has(view, 'Loading builds') && has(view, '#7'))
  await view.unmount()
})

test('empty: one pipeline, several pipelines, and a branch (AC23)', async () => {
  const one = await mount(panel, { host: setup(() => proj(), () => ok([])).host })
  assert.ok(has(one, 'No builds yet for acme/web'))
  await one.unmount()
  const many = await mount(panel, { host: setup(() => proj({ pipelines: [web, api] }), () => ok([])).host })
  assert.ok(has(many, 'No builds yet for the matching pipelines'))
  await many.unmount()
  const view = await mount(panel, { host: setup(() => proj(), () => ok([])).host })
  await view.toggle({ label: 'This branch only' })
  assert.ok(has(view, 'No builds on feat/x'))
  await view.unmount()
})

test('expanding a build lists its jobs, and expansion survives a refresh and is stored per workspace (AC16)', async () => {
  const s = setup(() => proj(), () => ok([build(1)]))
  const view = await mount(panel, { host: s.host })
  assert.ok(!view.find({ text: 'Run tests' }))
  await view.toggle({ text: /Jobs · 2/ })
  assert.ok(view.find({ text: 'Run tests' }) && view.find({ text: 'Deploy' }))
  await view.press({ label: 'Refresh' })
  assert.equal(s.inputs.length, 2)
  assert.ok(view.find({ text: 'Run tests' }))
  assert.deepEqual((view.persisted.storage['panel.prefs'] as any)['ws-1'].expanded, ['acme/web#1'])
  await view.toggle({ text: /Jobs · 2/ })
  assert.ok(!view.find({ text: 'Run tests' }))
  await view.unmount()
})

test('branch toggle: requests the branch, is remembered per workspace and merges into the prefs entry (AC14)', async () => {
  const s = setup(() => proj(), () => ok([build(1)]))
  const view = await mount(panel, { host: s.host })
  await view.toggle({ label: 'This branch only' })
  assert.deepEqual(s.inputs.at(-1), { pipelines: [{ org: 'acme', slug: 'web' }], branch: 'feat/x' })
  assert.equal((view.persisted.storage['panel.prefs'] as any)['ws-1'].branchOnly, true)
  await view.toggle({ label: 'This branch only' })
  assert.equal(s.inputs.at(-1).branch, undefined)
  await view.unmount()
})

test('stored prefs are used and merged, never replaced (AC14)', async () => {
  const inputs: any[] = []
  const host = mockHost({
    storage: { 'panel.prefs': { 'ws-1': { pipeline: 'acme/api', branchOnly: true }, 'ws-9': { pipeline: 'x' } } },
    requests: {
      'auth.status': () => signedIn,
      'project.get': () => ({ ok: true, value: proj({ pipelines: [web, api] }) }),
      'builds.list': (i: any) => (inputs.push(i), ok([build(1)]))
    } as never
  })
  const view = await mount(panel, { host })
  assert.deepEqual(inputs[0], { pipelines: [{ org: 'acme', slug: 'api' }], branch: 'feat/x' })
  assert.equal(view.valueOf({ label: 'This branch only' }), true)
  await view.toggle({ text: /Jobs · 2/ })
  assert.deepEqual(view.persisted.storage['panel.prefs'], {
    'ws-1': { pipeline: 'acme/api', branchOnly: true, expanded: ['acme/web#1'] },
    'ws-9': { pipeline: 'x' }
  })
  await view.unmount()
})

test('detached HEAD disables the toggle with a tooltip and requests no branch (AC14)', async () => {
  const s = setup(() => proj({ workspace: ws(null) }), () => ok([build(1)]))
  const view = await mount(panel, { host: s.host })
  assert.equal(view.find({ label: 'This branch only' })?.props?.disabled, true)
  assert.ok(view.find({ label: 'Why is this disabled?' }))
  assert.ok(has(view, 'detached HEAD'))
  assert.equal(s.inputs[0].branch, undefined)
  await view.unmount()
})

test('an unresolvable workspace id never writes prefs', async () => {
  const s = setup(() => proj({ workspace: ws('main', '') }), () => ok([build(1)]))
  const view = await mount(panel, { host: s.host })
  await view.toggle({ label: 'This branch only' })
  await view.toggle({ text: /Jobs · 2/ })
  assert.equal(s.inputs.at(-1).branch, 'main')
  assert.deepEqual(view.persisted.storage, {})
  await view.unmount()
})

test('polls every 15 s while open, and not after the panel closes (AC17)', async () => {
  mock.timers.enable({ apis: ['setInterval'] })
  try {
    const s = setup(() => proj(), () => ok([build(1)]))
    const view = await mount(panel, { host: s.host })
    assert.equal(s.inputs.length, 1)
    mock.timers.tick(14_999)
    await view.settled()
    assert.equal(s.inputs.length, 1)
    mock.timers.tick(1)
    await view.settled()
    assert.equal(s.inputs.length, 2)
    await view.setVisible(false)
    mock.timers.tick(15_000)
    await view.settled()
    assert.equal(s.inputs.length, 2)
    await view.setVisible(true)
    await view.settled()
    assert.equal(s.inputs.length, 3, 'refreshes once when visible again')
    await view.unmount()
    mock.timers.tick(60_000)
    assert.equal(s.inputs.length, 3)
  } finally {
    mock.timers.reset()
  }
})

test('Refresh button requests again and shows the last refresh time (AC17)', async () => {
  const s = setup(() => proj(), () => ok([build(1)]))
  const view = await mount(panel, { host: s.host })
  assert.ok(has(view, 'Updated'))
  await view.press({ label: 'Refresh' })
  assert.equal(s.inputs.length, 2)
  await view.unmount()
})

test('network failure: Retry, and stale data is kept and marked (AC24)', async () => {
  const net: BkError = { kind: 'network', message: "Can't reach Buildkite" }
  const s = setup(() => proj(), (_i, n) => (n === 1 ? ok([build(1)]) : n === 2 ? fail(net) : ok([build(1), build(2)])))
  const view = await mount(panel, { host: s.host })
  await view.press({ label: 'Refresh' })
  assert.ok(has(view, "Can't reach Buildkite") && has(view, 'Stale') && has(view, '#1'))
  await view.press({ text: 'Retry' })
  assert.ok(!has(view, "Can't reach Buildkite") && !has(view, 'Stale') && has(view, '#2'))
  await view.unmount()
})

test('network failure with nothing loaded shows Retry only (AC24)', async () => {
  const s = setup(() => proj(), (_i, n) => (n === 1 ? fail({ kind: 'network', message: 'x' }) : ok([build(1)])))
  const view = await mount(panel, { host: s.host })
  assert.ok(has(view, "Can't reach Buildkite") && !has(view, 'Stale'))
  await view.press({ text: 'Retry' })
  assert.ok(has(view, '#1'))
  await view.unmount()
})

test('other errors show the worker message with Retry', async () => {
  const s = setup(() => proj(), (_i, n) =>
    n === 1 ? fail({ kind: 'buildkite_error', status: 500, message: 'Buildkite returned an error (500)' }) : ok([build(1)])
  )
  const view = await mount(panel, { host: s.host })
  assert.ok(has(view, 'Buildkite returned an error (500)'))
  await view.press({ text: 'Retry' })
  assert.ok(has(view, '#1') && !has(view, 'returned an error'))
  await view.unmount()
})

test('rate limited: countdown, last data kept, no requests until it ends, then one (AC18)', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  try {
    const limited: BkError = { kind: 'rate_limited', message: 'Rate limited', retryAfterSec: 3 }
    const s = setup(() => proj(), (_i, n) => (n === 2 ? fail(limited) : ok([build(n)])))
    const view = await mount(panel, { host: s.host })
    await view.press({ label: 'Refresh' })
    assert.ok(has(view, 'Rate limited, retrying in 3s') && has(view, '#1'))
    assert.equal(view.find({ label: 'Refresh' })?.props?.disabled, true)
    mock.timers.tick(1000)
    await view.settled()
    assert.ok(has(view, 'Rate limited, retrying in 2s'))
    assert.equal(s.inputs.length, 2)
    mock.timers.tick(1000)
    await view.settled()
    assert.equal(s.inputs.length, 2)
    mock.timers.tick(1000)
    await view.settled()
    assert.equal(s.inputs.length, 3)
    assert.ok(!has(view, 'Rate limited') && has(view, '#3'))
    await view.unmount()
  } finally {
    mock.timers.reset()
  }
})

test('poll ticks during a rate limit make no request (AC18)', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  try {
    const s = setup(() => proj(), (_i, n) => (n === 2 ? fail({ kind: 'rate_limited', message: 'x', retryAfterSec: 40 }) : ok([build(n)])))
    const view = await mount(panel, { host: s.host })
    await view.press({ label: 'Refresh' })
    mock.timers.tick(30_000)
    await view.settled()
    assert.equal(s.inputs.length, 2)
    mock.timers.tick(10_000)
    await view.settled()
    assert.equal(s.inputs.length, 3)
    await view.unmount()
  } finally {
    mock.timers.reset()
  }
})

test('token_invalid from builds.list leaves the sign-in handling to auth.changed (AC25)', async () => {
  const s = setup(() => proj(), () => fail({ kind: 'token_invalid', message: 'Buildkite rejected this token' }))
  const view = await mount(panel, { host: s.host })
  assert.ok(!has(view, "Can't reach Buildkite"))
  await view.post('auth.changed', { state: 'signedOut', reason: 'token_rejected' })
  assert.ok(has(view, 'Your Buildkite token is no longer valid'))
  await view.unmount()
})

test('pipeline filter and workspace switch refetch and never show the previous workspace (AC13, AC26)', async () => {
  const s = setup(
    () => proj({ pipelines: [web, api] }),
    (i) => ok([build(i.pipelines.length)])
  )
  const view = await mount(panel, { host: s.host })
  assert.equal(s.inputs[0].pipelines.length, 2)
  await view.select({ label: 'Pipeline' }, 'acme/api')
  assert.deepEqual(s.inputs.at(-1).pipelines, [{ org: 'acme', slug: 'api' }])
  await view.post('project.changed', proj({ workspace: ws('main', 'ws-2'), pipelines: [web] }))
  assert.deepEqual(s.inputs.at(-1).pipelines, [{ org: 'acme', slug: 'web' }])
  assert.equal(s.inputs.length, 3)
  await view.unmount()
})

test('no request without a project, with no pipelines, or when signed out (AC1)', async () => {
  const s = setup(() => proj({ source: 'none', pipelines: [] }), () => ok([]))
  const view = await mount(panel, { host: s.host })
  assert.equal(s.inputs.length, 0)
  await view.unmount()
})

test('a rate limit survives a selection change: countdown kept, request deferred until it ends (AC18)', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  try {
    const s = setup(
      () => proj({ pipelines: [web, api] }),
      (_i, n) => (n === 2 ? fail({ kind: 'rate_limited', message: 'x', retryAfterSec: 3 }) : ok([build(n)]))
    )
    const view = await mount(panel, { host: s.host })
    await view.press({ label: 'Refresh' })
    assert.ok(has(view, 'Rate limited, retrying in 3s'))
    await view.toggle({ label: 'This branch only' })
    await view.select({ label: 'Pipeline' }, 'acme/api')
    await view.post('project.changed', proj({ workspace: ws('main', 'ws-2'), pipelines: [web, api] }))
    assert.equal(s.inputs.length, 2, 'no request during the limit')
    assert.ok(has(view, 'Rate limited, retrying in 3s') && !has(view, '#1'))
    mock.timers.tick(3000)
    await view.settled()
    assert.equal(s.inputs.length, 3)
    assert.ok(!has(view, 'Rate limited') && has(view, '#3'))
    await view.unmount()
  } finally {
    mock.timers.reset()
  }
})

test('selection changes while the panel is hidden make no request until it is visible again (AC17)', async () => {
  const s = setup(() => proj(), (_i, n) => ok([build(n)]))
  const view = await mount(panel, { host: s.host })
  await view.setVisible(false)
  await view.post('project.changed', proj({ workspace: ws('main', 'ws-2') }))
  await view.settled()
  assert.equal(s.inputs.length, 1)
  await view.setVisible(true)
  await view.settled()
  assert.equal(s.inputs.length, 2)
  assert.ok(has(view, '#2'))
  await view.unmount()
})

test('Retry after a failed first load shows the loading state while in flight (AC23)', async () => {
  let release: (a: Answer) => void = () => {}
  const gate = new Promise<Answer>((r) => (release = r))
  const s = setup(() => proj(), (_i, n) => (n === 1 ? fail({ kind: 'network', message: 'x' }) : gate) as Answer)
  const view = await mount(panel, { host: s.host })
  assert.ok(!has(view, 'Loading builds'))
  const pressing = view.press({ text: 'Retry' })
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(has(view, 'Loading builds'))
  release(ok([build(1)]))
  await pressing
  assert.ok(!has(view, 'Loading builds') && has(view, '#1'))
  await view.unmount()
})

test('a stale response from the previous workspace is discarded (AC26)', async () => {
  const release: Array<(a: Answer) => void> = []
  let n = 0
  const host = mockHost({
    requests: {
      'auth.status': () => signedIn,
      'project.get': () => ({ ok: true, value: proj() }),
      'builds.list': () => (++n === 1 ? ok([build(1)]) : new Promise<Answer>((r) => release.push(r)))
    } as never
  })
  const view = await mount(panel, { host })
  const refreshing = view.press({ label: 'Refresh' })
  await new Promise((r) => setTimeout(r, 20))
  const switching = view.post('project.changed', proj({ workspace: ws('main', 'ws-2') }))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(release.length, 2)
  release[1](ok([build(7)]))
  release[0](ok([build(1, { message: 'old workspace' })]))
  await Promise.all([switching, refreshing])
  assert.ok(has(view, '#7') && !has(view, 'old workspace'))
  await view.unmount()
})
