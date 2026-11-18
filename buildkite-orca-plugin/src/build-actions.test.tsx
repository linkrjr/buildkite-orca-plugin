import { mock } from 'node:test'
import { assert, hostError, mockHost, mount, test } from 'orca/testing'
import type { AuthState, BkError, Build, Pipeline, Project, Result } from './protocol'
import * as panel from './panel'

const auth = (canWriteBuilds: boolean): AuthState => ({ state: 'signedIn', user: { name: 'Ana' }, canWriteBuilds })
const web: Pipeline = {
  org: 'acme',
  slug: 'web',
  orgName: 'ACME',
  name: 'web',
  repository: 'git@github.com:acme/web.git',
  webUrl: 'https://buildkite.com/acme/web'
}
const project: Project = {
  workspace: { id: 'ws-1', path: '/p', remote: 'r', branch: 'main' },
  source: 'auto',
  pipelines: [web]
}
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
  jobs: [],
  ...over
})
const running = (n: number) => build(n, { state: 'running', finishedAt: null })
const blockedJob = (hasFields: boolean) => ({
  id: 'job-1',
  type: 'manual' as const,
  name: 'Deploy to production',
  state: 'blocked',
  unblockable: true,
  hasFields
})
const has = (view: { tree(): unknown }, text: string) => JSON.stringify(view.tree()).includes(text)
const fail = (error: BkError): Result<never> => ({ ok: false, error })
// The worker's real answer: its message names the pipeline by slug only.
const forbidden: BkError = {
  kind: 'forbidden',
  message: "You don't have permission to do this on web",
  pipeline: 'web',
  status: 403
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

function setup(
  list: (n: number) => Build[] | Promise<Build[]>,
  extra: Record<string, (input: any) => unknown> = {},
  write = true,
  results: Record<string, unknown> = {}
) {
  const lists: number[] = []
  const host = mockHost({
    results,
    requests: {
      'auth.status': () => auth(write),
      'project.get': () => ({ ok: true, value: project }),
      'builds.list': async () => {
        lists.push(1)
        return { ok: true, value: { builds: await list(lists.length), fetchedAt: '2026-11-13T10:05:00Z' } }
      },
      ...extra
    } as never
  })
  return { host, lists }
}

test('Rebuild on a finished build runs at once, shows the new number and refreshes (AC19)', async () => {
  let release: (r: unknown) => void = () => {}
  const gate = new Promise((r) => (release = r))
  const calls: unknown[] = []
  const s = setup(() => [build(7)], { 'builds.rebuild': (i) => (calls.push(i), gate) })
  const view = await mount(panel, { host: s.host })
  assert.ok(!has(view, 'Cancel'))
  const pressing = view.press({ text: 'Rebuild' })
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(calls, [{ org: 'acme', pipeline: 'web', number: 7 }])
  assert.ok(has(view, 'Rebuilding…'))
  release({ ok: true, value: { number: 8 } })
  await pressing
  assert.ok(!has(view, 'Rebuilding…'))
  assert.ok(has(view, 'Rebuild started as #8'))
  assert.equal(s.lists.length, 2)
  assert.deepEqual(view.errors, [])
  await view.unmount()
})

test('Cancel asks first, "Keep running" dismisses, "Cancel build" cancels and refreshes (AC19)', async () => {
  const calls: unknown[] = []
  const s = setup(() => [running(5)], { 'builds.cancel': (i) => (calls.push(i), { ok: true, value: {} }) })
  const view = await mount(panel, { host: s.host })
  assert.ok(!has(view, 'Rebuild'))
  await view.press({ text: 'Cancel' })
  assert.ok(has(view, 'Cancel build #5 on acme/web?'))
  assert.deepEqual(calls, [])
  await view.press({ text: 'Keep running' })
  assert.ok(!has(view, 'Cancel build #5 on acme/web?'))
  assert.deepEqual(calls, [])
  await view.press({ text: 'Cancel' })
  await view.press({ text: 'Cancel build' })
  assert.deepEqual(calls, [{ org: 'acme', pipeline: 'web', number: 5 }])
  assert.equal(s.lists.length, 2)
  assert.ok(!has(view, 'Cancel build #5 on acme/web?'))
  await view.unmount()
})

test('a canceling build offers neither Rebuild nor Cancel', async () => {
  const s = setup(() => [build(5, { state: 'canceling', finishedAt: null })])
  const view = await mount(panel, { host: s.host })
  assert.ok(!has(view, 'Rebuild') && !has(view, '"Cancel"'))
  await view.unmount()
})

test('forbidden shows the inline row error and nothing is retried (AC21)', async () => {
  const calls: unknown[] = []
  const s = setup(() => [build(7), build(6)], { 'builds.rebuild': (i) => (calls.push(i), fail(forbidden)) })
  const view = await mount(panel, { host: s.host })
  await view.press({ text: 'Rebuild' })
  assert.equal(calls.length, 1)
  // Built from the build's org/pipeline: the worker's text only has the slug, which can repeat across orgs.
  assert.equal(JSON.stringify(view.tree()).split("You don't have permission to do this on acme/web").length, 2)
  assert.ok(!has(view, 'on web'))
  assert.equal(s.lists.length, 1, 'no refresh after a failure')
  assert.ok(!has(view, 'Retry'))
  await view.unmount()
})

test('other failures show the worker message inline; token_invalid shows nothing inline (AC21)', async () => {
  let answer: Result<unknown> = fail({ kind: 'buildkite_error', message: 'Buildkite returned an error (500)' })
  const s = setup(() => [build(7)], { 'builds.rebuild': () => answer })
  const view = await mount(panel, { host: s.host })
  await view.press({ text: 'Rebuild' })
  assert.ok(has(view, 'Buildkite returned an error (500)'))
  answer = fail({ kind: 'token_invalid', message: 'Your Buildkite token is no longer valid' })
  await view.press({ text: 'Rebuild' })
  assert.ok(!has(view, 'Buildkite returned an error (500)'), 'cleared on the next attempt')
  assert.ok(!has(view, 'no longer valid'))
  await view.unmount()
})

test('a read-only token shows no action buttons but keeps the open link (AC20)', async () => {
  const s = setup(() => [build(7), running(6), build(5, { state: 'blocked', finishedAt: null, jobs: [blockedJob(false)] })], {}, false)
  const view = await mount(panel, { host: s.host })
  await view.toggle({ text: /Jobs · 1/ })
  for (const t of ['Rebuild', 'Unblock']) assert.ok(!has(view, t), t)
  assert.ok(!view.find({ text: 'Cancel' }))
  assert.ok(view.find({ label: 'Open build #7 in Buildkite' }))
  assert.ok(has(view, 'Read-only'))
  await view.unmount()
})

test('a blocked step with input fields opens Buildkite instead of unblocking (AC22)', async () => {
  const calls: unknown[] = []
  const s = setup(() => [build(4, { state: 'blocked', finishedAt: null, jobs: [blockedJob(true)] })], {
    'jobs.unblock': (i) => (calls.push(i), { ok: true, value: {} })
  })
  const view = await mount(panel, { host: s.host })
  await view.toggle({ text: /Jobs · 1/ })
  assert.ok(!view.find({ text: 'Unblock' }))
  await view.press({ text: 'Unblock in Buildkite' })
  assert.deepEqual(s.host.callsOf('shell.openExternal'), [{ url: 'https://buildkite.com/acme/web/builds/4' }])
  assert.deepEqual(calls, [])
  await view.unmount()
})

test('a blocked step without fields: Unblock asks first, then unblocks and refreshes (AC19)', async () => {
  const calls: unknown[] = []
  const s = setup(() => [build(4, { state: 'blocked', finishedAt: null, jobs: [blockedJob(false)] })], {
    'jobs.unblock': (i) => (calls.push(i), { ok: true, value: {} })
  })
  const view = await mount(panel, { host: s.host })
  await view.toggle({ text: /Jobs · 1/ })
  assert.ok(!has(view, 'Unblock in Buildkite'))
  await view.press({ text: 'Unblock' })
  assert.ok(has(view, 'Unblock “Deploy to production” on acme/web?'))
  assert.deepEqual(calls, [])
  await view.press({ text: 'Not now' })
  assert.deepEqual(calls, [])
  await view.press({ text: 'Unblock' })
  await view.press({ text: 'Unblock' })
  assert.deepEqual(calls, [{ org: 'acme', pipeline: 'web', number: 4, jobId: 'job-1' }])
  assert.equal(s.lists.length, 2)
  await view.unmount()
})

test('a second press before the first call returns runs it once (AC19)', async () => {
  let release: (r: unknown) => void = () => {}
  const gate = new Promise((r) => (release = r))
  const calls: unknown[] = []
  const s = setup(() => [running(5)], { 'builds.cancel': (i) => (calls.push(i), gate) })
  const view = await mount(panel, { host: s.host })
  await view.press({ text: 'Cancel' })
  const first = view.press({ text: 'Cancel build' })
  const second = view.press({ text: 'Cancel build' })
  await tick()
  release({ ok: true, value: {} })
  await Promise.all([first, second])
  assert.equal(calls.length, 1)
  await view.unmount()
})

test('the refresh after an action waits for a poll already in flight (AC19)', async () => {
  mock.timers.enable({ apis: ['setInterval'] })
  try {
    let cancelled = false
    let releasePoll: () => void = () => {}
    const poll = new Promise<void>((r) => (releasePoll = r))
    const s = setup(
      async (n) => {
        if (n === 2) await poll
        return [cancelled ? build(5, { state: 'canceling', finishedAt: null }) : running(5)]
      },
      { 'builds.cancel': () => ((cancelled = true), { ok: true, value: {} }) }
    )
    const view = await mount(panel, { host: s.host })
    mock.timers.tick(15_000)
    await tick()
    assert.equal(s.lists.length, 2, 'the poll is in flight')
    const opening = view.press({ text: 'Cancel' })
    await tick()
    const cancelling = view.press({ text: 'Cancel build' })
    await tick()
    releasePoll()
    await Promise.all([opening, cancelling])
    assert.equal(s.lists.length, 3, 'a request made after the cancel went through')
    assert.ok(has(view, 'canceling'))
    assert.ok(!view.find({ text: 'Cancel' }), 'no Cancel button on a canceling build')
    await view.unmount()
  } finally {
    mock.timers.reset()
  }
})

test('a row stays busy through a poll and other rows are unaffected (AC19)', async () => {
  mock.timers.enable({ apis: ['setInterval'] })
  try {
    let release: (r: unknown) => void = () => {}
    const gate = new Promise((r) => (release = r))
    const s = setup(() => [build(7), build(6)], { 'builds.rebuild': () => gate })
    const view = await mount(panel, { host: s.host })
    const rebuilding = view.press({ text: 'Rebuild' })
    await tick()
    mock.timers.tick(15_000)
    await tick()
    assert.equal(s.lists.length, 2)
    assert.equal(view.find({ text: 'Rebuilding…' })?.disabled, true)
    assert.equal(view.find({ text: 'Rebuild' })?.disabled, false, 'the other row can still be rebuilt')
    release({ ok: true, value: { number: 8 } })
    await rebuilding
    await view.unmount()
  } finally {
    mock.timers.reset()
  }
})

test('actions are disabled while the list is stale, confirmations included (AC24)', async () => {
  let calls = 0
  const s = setup(() => {
    if (++calls > 1) throw hostError('unavailable')
    return [build(7), running(6)]
  })
  const view = await mount(panel, { host: s.host })
  assert.equal(view.find({ text: 'Rebuild' })?.disabled, false)
  await view.press({ text: 'Cancel' })
  assert.equal(view.find({ text: 'Cancel build' })?.disabled, false)
  await view.press({ label: 'Refresh' })
  assert.ok(has(view, 'Stale'))
  assert.equal(view.find({ text: 'Rebuild' })?.disabled, true)
  assert.equal(view.find({ text: 'Cancel build' })?.disabled, true)
  await view.unmount()
})

test('a refresh that changes a row drops its confirmation, note and error (AC19, AC21)', async () => {
  let state = 'running'
  const s = setup(() => [build(5, { state, finishedAt: null })], {
    'builds.cancel': () => fail({ kind: 'buildkite_error', message: 'Buildkite returned an error (500)' })
  })
  const view = await mount(panel, { host: s.host })
  await view.press({ text: 'Cancel' })
  await view.press({ text: 'Cancel build' })
  assert.ok(has(view, 'Buildkite returned an error (500)'))
  await view.press({ text: 'Cancel' })
  assert.ok(has(view, 'Cancel build #5 on acme/web?'))
  state = 'canceling'
  await view.press({ label: 'Refresh' })
  assert.ok(!has(view, 'Cancel build #5 on acme/web?'))
  assert.ok(!has(view, 'Buildkite returned an error (500)'))
  assert.ok(!view.find({ text: 'Cancel' }))
  await view.unmount()
})

test('the rebuild note ends once the new build is listed (AC19)', async () => {
  const s = setup((n) => (n >= 3 ? [build(8), build(7)] : [build(7)]), {
    'builds.rebuild': () => ({ ok: true, value: { number: 8 } })
  })
  const view = await mount(panel, { host: s.host })
  await view.press({ text: 'Rebuild' })
  assert.ok(has(view, 'Rebuild started as #8'))
  await view.press({ label: 'Refresh' })
  assert.ok(has(view, 'Commit 8'))
  assert.ok(!has(view, 'Rebuild started as #8'))
  await view.unmount()
})

test('no note when the new build is already in the refreshed list (AC19)', async () => {
  const s = setup((n) => (n >= 2 ? [build(8), build(7)] : [build(7)]), {
    'builds.rebuild': () => ({ ok: true, value: { number: 8 } })
  })
  const view = await mount(panel, { host: s.host })
  await view.press({ text: 'Rebuild' })
  assert.ok(has(view, 'Commit 8'))
  assert.ok(!has(view, 'Rebuild started'))
  await view.unmount()
})

test('Cancel failures show inline and are not retried (AC21)', async () => {
  const calls: unknown[] = []
  const s = setup(() => [running(5)], { 'builds.cancel': (i) => (calls.push(i), fail(forbidden)) })
  const view = await mount(panel, { host: s.host })
  await view.press({ text: 'Cancel' })
  await view.press({ text: 'Cancel build' })
  assert.equal(calls.length, 1)
  assert.ok(has(view, "You don't have permission to do this on acme/web"))
  assert.ok(!has(view, 'Cancel build #5 on acme/web?'))
  assert.equal(s.lists.length, 1)
  await view.unmount()
})

test('Unblock failures show inline and are not retried (AC21)', async () => {
  const calls: unknown[] = []
  const s = setup(() => [build(4, { state: 'blocked', finishedAt: null, jobs: [blockedJob(false)] })], {
    'jobs.unblock': (i) => (calls.push(i), fail(forbidden))
  })
  const view = await mount(panel, { host: s.host })
  await view.toggle({ text: /Jobs · 1/ })
  await view.press({ text: 'Unblock' })
  await view.press({ text: 'Unblock' })
  assert.equal(calls.length, 1)
  assert.ok(has(view, "You don't have permission to do this on acme/web"))
  assert.equal(s.lists.length, 1)
  await view.unmount()
})

test('a build URL that is not https on buildkite.com is never opened (AC22)', async () => {
  const bad = ['', 'not a url', 'http://buildkite.com/acme/web/builds/1', 'https://evil.example/acme/web', 'https://buildkite.com.evil.example/x']
  for (const webUrl of bad) {
    const s = setup(() => [build(4, { webUrl, state: 'blocked', finishedAt: null, jobs: [blockedJob(true)] })])
    const view = await mount(panel, { host: s.host })
    await view.toggle({ text: /Jobs · 1/ })
    assert.equal(view.find({ label: 'Open build #4 in Buildkite' })?.disabled, true, webUrl)
    assert.equal(view.find({ text: 'Unblock in Buildkite' })?.disabled, true, webUrl)
    assert.deepEqual(s.host.callsOf('shell.openExternal'), [], webUrl)
    await view.unmount()
  }
})

test('Orca refusing to open the browser is handled quietly (AC22)', async () => {
  const s = setup(
    () => [build(4, { state: 'blocked', finishedAt: null, jobs: [blockedJob(true)] })],
    {},
    true,
    {
      'shell.openExternal': () => {
        throw hostError('not_permitted', 'declined')
      }
    }
  )
  const view = await mount(panel, { host: s.host })
  await view.toggle({ text: /Jobs · 1/ })
  await view.press({ text: 'Unblock in Buildkite' })
  await view.press({ label: 'Open build #4 in Buildkite' })
  assert.deepEqual(view.errors, [])
  await view.unmount()
})
