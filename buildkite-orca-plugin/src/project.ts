// The active workspace's project: which Buildkite pipelines (that the token can see) belong to it.
// Auto-match by normalized repository, or the pipelines the user picked for that workspace.
import type { OrcaWorkerApi } from 'orca/worker'
import type { Auth } from './auth'
import type { Pipeline, PipelineRef, Project, Result, Workspace } from './protocol'
import { normalizeRemote, readGitRemote, stripCredentials } from './remote'

const PER_PAGE = 100
const MAX_PAGES = 50
const CACHE_TTL_MS = 60_000
/** A workspace the host did not identify uniquely: it has no id, so no choice is stored for it. */
const UNRESOLVED = ''
const choiceKey = (workspaceId: string) => `project.choice.${workspaceId}`
const refKey = (p: PipelineRef) => `${p.org}/${p.slug}`

type Deps = { readRemote: (path: string) => Promise<string | null> }
type Listed = {
  workspaces: { id: string; name: string; path: string; branch: string | null; hostId?: string | null }[]
  truncated?: boolean
}

export function registerProject(orca: OrcaWorkerApi, auth: Auth, deps: Deps = { readRemote: readGitRemote }): void {
  /** Every page of a Buildkite collection (pages are full until the last one). */
  async function getAll(path: string): Promise<Result<Record<string, any>[]>> {
    const all: Record<string, any>[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await auth.request('GET', `${path}?per_page=${PER_PAGE}&page=${page}`)
      if (!res.ok) return res
      const items = Array.isArray(res.value) ? (res.value as Record<string, any>[]) : []
      all.push(...items)
      if (items.length < PER_PAGE) return { ok: true, value: all }
    }
    return { ok: false, error: { kind: 'buildkite_error', message: 'Too many Buildkite pipelines to list' } }
  }

  // Short-lived cache of the listing, dropped whenever the token changes. `generation` keeps a
  // listing that was in flight during a sign-in/out from being cached.
  let cache: { at: number; pipelines: Pipeline[] } | null = null
  let generation = 0
  auth.onChange(() => { cache = null; generation++ })

  async function visiblePipelines(): Promise<Result<Pipeline[]>> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return { ok: true, value: cache.pipelines }
    const started = generation
    const listed = await listVisiblePipelines()
    if (listed.ok && started === generation) cache = { at: Date.now(), pipelines: listed.value }
    return listed
  }

  async function listVisiblePipelines(): Promise<Result<Pipeline[]>> {
    const orgs = await getAll('/v2/organizations')
    if (!orgs.ok) return orgs
    const pipelines: Pipeline[] = []
    for (const org of orgs.value) {
      const listed = await getAll(`/v2/organizations/${encodeURIComponent(String(org.slug))}/pipelines`)
      if (!listed.ok) return listed
      for (const p of listed.value) {
        pipelines.push({
          org: String(org.slug),
          slug: String(p.slug),
          orgName: String(org.name ?? org.slug),
          name: String(p.name ?? p.slug),
          repository: String(p.repository ?? ''),
          webUrl: String(p.web_url ?? '')
        })
      }
    }
    return { ok: true, value: pipelines }
  }

  const listWorkspaces = async (): Promise<Listed> => {
    try {
      return (await orca.host.call('workspace.list')) as Listed
    } catch {
      return { workspaces: [] }
    }
  }

  /** The git remote is read only for a workspace on this machine, and never leaves with credentials. */
  async function toWorkspace(w: Listed['workspaces'][number], branch: string | null): Promise<Workspace> {
    const local = w.path && !w.hostId
    return { id: w.id, path: w.path, remote: stripCredentials(local ? await deps.readRemote(w.path) : null), branch }
  }

  async function activeWorkspace(): Promise<Workspace | null> {
    let context
    try {
      context = await orca.host.call('workspace.readContext')
    } catch {
      return null
    }
    if (!context) return null
    // The host gives no id here: match by name and branch, and only trust a single match. Several
    // (or none, e.g. past a truncated list) is unresolved, never "the first".
    const { workspaces } = await listWorkspaces()
    const matches = workspaces.filter((w) => w.name === context.displayName && w.branch === context.branch)
    if (matches.length === 1) return toWorkspace(matches[0], context.branch)
    return { id: UNRESOLVED, path: '', remote: null, branch: context.branch }
  }

  async function workspaceById(id: string): Promise<Workspace | null> {
    if (id === UNRESOLVED) return null
    const active = await activeWorkspace()
    if (active?.id === id) return active
    const found = (await listWorkspaces()).workspaces.find((w) => w.id === id)
    return found ? toWorkspace(found, found.branch) : null
  }

  async function projectFor(workspace: Workspace | null): Promise<Result<Project>> {
    if (!workspace) return { ok: true, value: { workspace: null, source: 'none', pipelines: [] } }
    const visible = await visiblePipelines()
    if (!visible.ok) return visible
    const chosen = workspace.id === UNRESOLVED
      ? undefined
      : ((await orca.storage.get(choiceKey(workspace.id))) as PipelineRef[] | undefined)
    if (Array.isArray(chosen)) {
      const wanted = new Set(chosen.map(refKey))
      const pipelines = visible.value.filter((p) => wanted.has(refKey(p)))
      if (pipelines.length) return { ok: true, value: { workspace, source: 'manual', pipelines } }
    }
    const key = normalizeRemote(workspace.remote)
    const pipelines = key ? visible.value.filter((p) => normalizeRemote(p.repository) === key) : []
    return { ok: true, value: { workspace, source: pipelines.length ? 'auto' : 'none', pipelines } }
  }

  orca.panels.handle('project.get', async () => projectFor(await activeWorkspace()))

  orca.panels.handle('pipelines.visible', async (input): Promise<Result<Pipeline[]>> => {
    const visible = await visiblePipelines()
    const query = (typeof input?.query === 'string' ? input.query : '').trim().toLowerCase()
    if (!visible.ok || !query) return visible
    const hit = (p: Pipeline) => [p.name, p.slug, p.org, p.orgName].some((f) => f.toLowerCase().includes(query))
    return { ok: true, value: visible.value.filter(hit) }
  })

  orca.panels.handle('project.choose', async (input): Promise<Result<Project>> => {
    const workspace = await workspaceById(String(input?.workspaceId))
    if (!workspace) return { ok: false, error: { kind: 'no_workspace', message: 'That workspace is not available' } }
    if (input.pipelines === null) {
      await orca.storage.delete(choiceKey(workspace.id))
    } else {
      const visible = await visiblePipelines()
      if (!visible.ok) return visible
      const wanted = new Set((input.pipelines ?? []).map(refKey))
      const refs = visible.value.filter((p) => wanted.has(refKey(p))).map(({ org, slug }) => ({ org, slug }))
      await orca.storage.set(choiceKey(workspace.id), refs)
    }
    const project = await projectFor(workspace)
    if (project.ok) orca.panels.post('project.changed', project.value)
    return project
  })

  // `workspace.changed` also fires when terminals open or close: post only when the focused
  // workspace or branch actually differs from the last one seen.
  const focusKey = (c: { displayName: string; branch: string } | null) => (c ? `${c.displayName}\0${c.branch}` : '')
  let focus: Promise<string> = Promise.resolve(orca.host.call('workspace.readContext')).then(focusKey, () => '')
  orca.events.on('workspace.changed', async ({ context }) => {
    const previous = await focus
    const key = focusKey(context)
    focus = Promise.resolve(key)
    if (previous === key) return
    // Signed out: nothing to look up (and no token to call it a rejection).
    if ((await auth.status()).state !== 'signedIn') return
    const workspace = await activeWorkspace()
    const project = await projectFor(workspace)
    // Even when the lookup fails, the panel must not keep the previous workspace's project.
    orca.panels.post('project.changed', project.ok ? project.value : { workspace, source: 'none', pipelines: [] })
  })
}
