import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { createAuth } from './auth'
import { registerProject } from './project'
import type { Pipeline, Project, Result } from './protocol'
import { FAKE_TOKEN, installFakeBuildkite, type FakeRoutes } from './testing/fake-buildkite'

const ORGS = [{ slug: 'acme', name: 'Acme Inc' }, { slug: 'other', name: 'Other Org' }]
const pipe = (slug: string, repository: string, org = 'acme') => ({
  slug, name: slug.toUpperCase(), repository, web_url: `https://buildkite.com/${org}/${slug}`, organization: { slug: org }
})
const WEB = pipe('web', 'git@github.com:acme/web.git')
const WEB_FORK = pipe('web-other', 'https://github.com/Acme/Web', 'other')
const API = pipe('api', 'git@github.com:acme/api.git')

const routes = (acme: unknown[] = [WEB, API], other: unknown[] = [WEB_FORK]): FakeRoutes => ({
  'GET /v2/organizations': { status: 200, json: ORGS },
  'GET /v2/organizations/acme/pipelines': { status: 200, json: acme },
  'GET /v2/organizations/other/pipelines': { status: 200, json: other }
})

const WS = { id: 'ws-1', kind: 'worktree', name: 'web', path: '/repos/web', branch: 'main', hostId: null }
type Opts = { remote?: string | null; context?: unknown; workspaces?: unknown[]; storage?: Record<string, never>; secrets?: Record<string, string> }

async function setup(r: FakeRoutes, o: Opts = {}) {
  const fake = installFakeBuildkite(r)
  const remotes: string[] = []
  const host = mockHost({
    secrets: o.secrets ?? { token: FAKE_TOKEN },
    storage: { 'auth.profile': { user: { name: 'Ada' }, canWriteBuilds: true }, ...o.storage },
    results: {
      'workspace.readContext': 'context' in o ? o.context : { branch: 'main', displayName: 'web', terminals: [] },
      'workspace.list': { workspaces: o.workspaces ?? [WS], truncated: false }
    }
  })
  const worker = await mountWorker({
    default: (orca) => registerProject(orca, createAuth(orca), {
      readRemote: async (path) => { remotes.push(path); return 'remote' in o ? o.remote! : 'git@github.com:acme/web.git' }
    })
  }, { host })
  await worker.emit('workspace.changed', { context: 'context' in o ? (o.context as never) : { branch: 'main', displayName: 'web', terminals: [] } })
  remotes.length = 0
  return { fake, host, worker, remotes, done: async () => { fake.restore(); await worker.deactivate() } }
}
const slugs = (ps: Pipeline[]) => ps.map((p) => `${p.org}/${p.slug}`)
const value = <T>(r: Result<T>): T => { assert.equal(r.ok, true); return (r as { value: T }).value }

test('project.get auto-matches every visible pipeline whose repository equals the origin remote, across organizations', async () => {
  const t = await setup(routes())
  const project = value(await t.worker.request('project.get'))
  assert.equal(project.source, 'auto')
  assert.deepEqual(slugs(project.pipelines), ['acme/web', 'other/web-other'])
  await t.done()
})

test('project.get answers the workspace with its path, remote and branch', async () => {
  const t = await setup(routes())
  const project = value(await t.worker.request('project.get'))
  assert.deepEqual(project.workspace, { id: 'ws-1', path: '/repos/web', remote: 'git@github.com:acme/web.git', branch: 'main' })
  assert.deepEqual(t.remotes, ['/repos/web'])
  await t.done()
})

test('project.get answers pipelines with org name, name, repository and web url', async () => {
  const t = await setup(routes())
  const [first] = value(await t.worker.request('project.get')).pipelines
  assert.deepEqual(first, { org: 'acme', slug: 'web', orgName: 'Acme Inc', name: 'WEB', repository: 'git@github.com:acme/web.git', webUrl: 'https://buildkite.com/acme/web' })
  await t.done()
})

test('project.get matches an https remote against an ssh pipeline repository', async () => {
  const t = await setup(routes(), { remote: 'https://github.com/acme/api' })
  assert.deepEqual(slugs(value(await t.worker.request('project.get')).pipelines), ['acme/api'])
  await t.done()
})

test('project.get answers source none when no visible pipeline matches', async () => {
  const t = await setup(routes(), { remote: 'git@github.com:nobody/else.git' })
  const project = value(await t.worker.request('project.get'))
  assert.deepEqual([project.source, project.pipelines], ['none', []])
  await t.done()
})

test('project.get answers source none when the workspace has no git remote', async () => {
  const t = await setup(routes(), { remote: null })
  assert.equal(value(await t.worker.request('project.get')).source, 'none')
  await t.done()
})

test('project.get never lists a pipeline the token cannot see', async () => {
  const t = await setup(routes([API], []))
  assert.deepEqual(value(await t.worker.request('project.get')).pipelines, [])
  await t.done()
})

test('project.get answers a null workspace and calls Buildkite for nothing when no workspace is active', async () => {
  const t = await setup(routes(), { context: null })
  assert.deepEqual(value(await t.worker.request('project.get')), { workspace: null, source: 'none', pipelines: [] })
  await t.done()
})

test('project.get falls back to the display name as id when the workspace is not in the list', async () => {
  const t = await setup(routes(), { workspaces: [] })
  const project = value(await t.worker.request('project.get'))
  assert.deepEqual(project.workspace, { id: 'web', path: '', remote: null, branch: 'main' })
  await t.done()
})

test('pipelines.visible lists every visible pipeline of every organization', async () => {
  const t = await setup(routes())
  assert.deepEqual(slugs(value(await t.worker.request('pipelines.visible', {}))), ['acme/web', 'acme/api', 'other/web-other'])
  await t.done()
})

test('pipelines.visible filters by name, slug or organization, case-insensitively', async () => {
  const t = await setup(routes())
  assert.deepEqual(slugs(value(await t.worker.request('pipelines.visible', { query: 'API' }))), ['acme/api'])
  assert.deepEqual(slugs(value(await t.worker.request('pipelines.visible', { query: 'other org' }))), ['other/web-other'])
  await t.done()
})

test('pipelines.visible follows pagination until a short page', async () => {
  const many = Array.from({ length: 100 }, (_, i) => pipe(`p${i}`, 'x/y'))
  const r = routes()
  r['GET /v2/organizations/acme/pipelines'] = (req) =>
    ({ status: 200, json: new URL(req.url).searchParams.get('page') === '2' ? [API] : many })
  const t = await setup(r)
  assert.equal(value(await t.worker.request('pipelines.visible', {})).length, 100 + 1 + 1)
  await t.done()
})

test('pipelines.visible answers the Buildkite error when listing organizations fails', async () => {
  const t = await setup({ 'GET /v2/organizations': 'network-error' })
  const answer = await t.worker.request('pipelines.visible', {})
  assert.deepEqual(answer, { ok: false, error: { kind: 'network', message: "Can't reach Buildkite" } })
  await t.done()
})

test('pipelines.visible answers the error when one organization fails', async () => {
  const r = routes()
  r['GET /v2/organizations/other/pipelines'] = { status: 500 }
  const t = await setup(r)
  const answer = await t.worker.request('pipelines.visible', {})
  assert.equal((answer as { ok: boolean }).ok, false)
  await t.done()
})

test('project.choose remembers the chosen pipelines for the workspace and project.get answers them as manual', async () => {
  const t = await setup(routes())
  const chosen = value(await t.worker.request('project.choose', { workspaceId: 'ws-1', pipelines: [{ org: 'acme', slug: 'api' }] }))
  assert.deepEqual([chosen.source, slugs(chosen.pipelines)], ['manual', ['acme/api']])
  const again = value(await t.worker.request('project.get'))
  assert.deepEqual([again.source, slugs(again.pipelines)], ['manual', ['acme/api']])
  await t.done()
})

test('project.choose keeps a choice per workspace', async () => {
  const t = await setup(routes(), { workspaces: [WS, { ...WS, id: 'ws-2', name: 'other', path: '/repos/other' }] })
  await t.worker.request('project.choose', { workspaceId: 'ws-2', pipelines: [{ org: 'acme', slug: 'api' }] })
  assert.equal(value(await t.worker.request('project.get')).source, 'auto')
  await t.done()
})

test('project.choose drops pipelines the token cannot see', async () => {
  const t = await setup(routes())
  const chosen = value(await t.worker.request('project.choose', {
    workspaceId: 'ws-1', pipelines: [{ org: 'acme', slug: 'api' }, { org: 'secret', slug: 'hidden' }]
  }))
  assert.deepEqual(slugs(chosen.pipelines), ['acme/api'])
  assert.equal(JSON.stringify(t.host.data().storage).includes('hidden'), false)
  await t.done()
})

test('project.choose with null resets to automatic matching', async () => {
  const t = await setup(routes())
  await t.worker.request('project.choose', { workspaceId: 'ws-1', pipelines: [{ org: 'acme', slug: 'api' }] })
  const reset = value(await t.worker.request('project.choose', { workspaceId: 'ws-1', pipelines: null }))
  assert.deepEqual([reset.source, slugs(reset.pipelines)], ['auto', ['acme/web', 'other/web-other']])
  await t.done()
})

test('project.get ignores a remembered choice that is no longer visible and falls back to auto', async () => {
  const t = await setup(routes(), { storage: { 'project.choice.ws-1': [{ org: 'gone', slug: 'x' }] } as never })
  assert.equal(value(await t.worker.request('project.get')).source, 'auto')
  await t.done()
})

test('project.choose answers no_workspace for an unknown workspace', async () => {
  const t = await setup(routes())
  const answer = await t.worker.request('project.choose', { workspaceId: 'nope', pipelines: null })
  assert.equal((answer as { error: { kind: string } }).error.kind, 'no_workspace')
  await t.done()
})

test('project.choose posts project.changed', async () => {
  const t = await setup(routes())
  await t.worker.request('project.choose', { workspaceId: 'ws-1', pipelines: null })
  assert.deepEqual(t.worker.posts.map((p) => p.event), ['project.changed'])
  await t.done()
})

const API_WS = { id: 'ws-2', kind: 'worktree', name: 'api', path: '/repos/api', branch: 'main', hostId: null }
const focus = (displayName: string, branch = 'main') => ({ context: { branch, displayName, terminals: [] } })

test('a workspace.changed event for another workspace posts project.changed with that workspace', async () => {
  const t = await setup(routes(), { workspaces: [WS, API_WS], remote: 'git@github.com:acme/api.git' })
  t.host.respond('workspace.readContext', focus('api').context)
  await t.worker.emit('workspace.changed', focus('api'))
  const post = t.worker.posts.find((p) => p.event === 'project.changed')
  assert.deepEqual([(post!.payload as Project).workspace?.id, slugs((post!.payload as Project).pipelines)], ['ws-2', ['acme/api']])
  await t.done()
})

test('a workspace.changed event for the same workspace and branch posts nothing', async () => {
  const t = await setup(routes())
  await t.worker.emit('workspace.changed', focus('web'))
  assert.deepEqual(t.worker.posts, [])
  await t.done()
})

test('a workspace.changed event with no focused workspace posts a null workspace', async () => {
  const t = await setup(routes())
  t.host.respond('workspace.readContext', null)
  await t.worker.emit('workspace.changed', { context: null })
  assert.deepEqual(t.worker.posts.find((p) => p.event === 'project.changed')?.payload, { workspace: null, source: 'none', pipelines: [] })
  await t.done()
})

test('a workspace.changed event while signed out posts nothing and calls nothing', async () => {
  const t = await setup(routes(), { secrets: {}, workspaces: [WS, API_WS] })
  await t.worker.emit('workspace.changed', focus('api'))
  assert.deepEqual([t.worker.posts, t.fake.requests], [[], []])
  await t.done()
})

test('project requests with a rejected token answer token_invalid and sign out', async () => {
  const t = await setup({ 'GET /v2/organizations': { status: 401 } })
  const answer = await t.worker.request('project.get')
  assert.equal((answer as { error: { kind: string } }).error.kind, 'token_invalid')
  assert.deepEqual(t.host.data().secrets, {})
  await t.done()
})
