// `orca plugin check` renders the panel once per scenario, each with the worker on a fresh
// host. Seed what the worker reads so check shows more than the first state; the project
// scenarios answer the worker's requests directly, so no Buildkite request is ever made.
// The token-rejected notice only follows an `auth.changed` event, which check cannot deliver
// (it replays Orca events only); src/panel.test.tsx covers it.
import { defineCheck } from 'orca/testing'
import type { AuthState, Pipeline, Project } from './protocol'

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
  }
})
