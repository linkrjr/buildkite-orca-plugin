// `orca plugin check` renders the panel once per scenario, each with the worker on a fresh
// host. Seed what the worker reads so check shows more than the first state; the project
// scenarios answer the worker's requests directly, so no Buildkite request is ever made.
// Stale builds (a network failure after a successful load) and the countdown ticking need time to
// pass, which check cannot do; src/builds-view.test.tsx covers them.
// The token-rejected notice only follows an `auth.changed` event, which check cannot deliver
// (it replays Orca events only); src/panel.test.tsx covers it.
import { defineCheck } from 'orca/testing'
import type { AuthState, BkError, Build, Pipeline, Project, Result } from './protocol'

const signedInState: AuthState = { state: 'signedIn', user: { name: 'Ana Souza' }, canWriteBuilds: true }
const pipeline = (org: string, slug: string): Pipeline => ({
  org,
  slug,
  orgName: org === 'acme' ? 'Acme Inc' : 'Ops',
  name: slug,
  repository: `git@github.com:${org}/${slug}.git`,
  webUrl: `https://buildkite.com/${org}/${slug}`
})
const all = [pipeline('acme', 'web'), pipeline('acme', 'api'), pipeline('ops', 'infra')]
const workspace = { id: 'ws-1', path: '/repos/web', remote: 'git@github.com:acme/web.git', branch: 'main' }

const withProject = (value: Project) => ({
  requests: {
    'auth.status': () => signedInState,
    'project.get': () => ({ ok: true as const, value }),
    'pipelines.visible': () => ({ ok: true as const, value: all })
  }
})

const build = (n: number, over: Partial<Build> = {}): Build => ({
  org: 'acme',
  pipelineSlug: 'web',
  pipelineName: 'web',
  number: n,
  state: 'passed',
  branch: 'main',
  message: `Fix flaky test ${n}`,
  author: 'Bia Lima',
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
const sample = [
  build(4827, { state: 'running', finishedAt: null }),
  build(4826, { pipelineSlug: 'api', pipelineName: 'api' }),
  build(4825, { state: 'failed' })
]
const listing = (answer: () => Result<{ builds: Build[]; fetchedAt: string }>, project: Project) => ({
  requests: {
    ...withProject(project).requests,
    'builds.list': answer
  }
})
const okBuilds = (builds: Build[]) => ({ ok: true as const, value: { builds, fetchedAt: '2026-11-13T10:05:00Z' } })
const failed = (error: BkError) => ({ ok: false as const, error })

export default defineCheck({
  signedOut: {},
  signedIn: {
    secrets: { token: 'bkua_fake_check_token' },
    storage: { 'auth.profile': { user: { name: 'Ana Souza' }, canWriteBuilds: true } }
  },
  noWorkspace: withProject({ workspace: null, source: 'none', pipelines: [] }),
  noMatchWithPicker: withProject({ workspace, source: 'none', pipelines: [] }),
  multiplePipelinesWithFilter: {
    ...withProject({ workspace, source: 'auto', pipelines: all.slice(0, 2) }),
    storage: { 'panel.prefs': { 'ws-1': { pipeline: 'acme/api' } } }
  },
  // No `builds.list` answer: the panel is still on its loading skeleton when check snapshots it.
  loadingBuilds: withProject({ workspace, source: 'auto', pipelines: [all[0]] }),
  buildsFromSeveralPipelines: {
    ...listing(() => okBuilds(sample), { workspace, source: 'auto', pipelines: all.slice(0, 2) }),
    storage: { 'panel.prefs': { 'ws-1': { expanded: ['acme/web#4827'] } } }
  },
  noBuilds: listing(() => okBuilds([]), { workspace, source: 'auto', pipelines: [all[0]] }),
  networkError: listing(() => failed({ kind: 'network', message: "Can't reach Buildkite" }), {
    workspace,
    source: 'auto',
    pipelines: [all[0]]
  }),
  rateLimited: listing(() => failed({ kind: 'rate_limited', message: 'Rate limited', retryAfterSec: 42 }), {
    workspace,
    source: 'auto',
    pipelines: [all[0]]
  })
})
