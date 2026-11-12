// builds.list: fetch each pipeline's builds (with jobs), map to the contract and order them.
import type { Auth } from './auth'
import type { Build, BkError, Job, PipelineRef, Result } from './protocol'

const LIMIT = 20
const ACTIVE = ['running', 'scheduled', 'blocked', 'canceling']
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const JOB_TYPES: Job['type'][] = ['script', 'manual', 'waiter', 'trigger']

type Raw = Record<string, any>
type ListInput = { pipelines: PipelineRef[]; branch?: string }
type Listed = { builds: Build[]; fetchedAt: string }

function toJob(j: Raw): Job {
  const type: Job['type'] = JOB_TYPES.includes(j.type) ? j.type : 'script'
  return {
    id: String(j.id ?? ''),
    type,
    name: String(j.name ?? j.label ?? j.type ?? ''),
    state: String(j.state ?? ''),
    unblockable: type === 'manual' && j.state === 'blocked' && Boolean(j.unblock_url || j.unblockable),
    hasFields: Array.isArray(j.fields) && j.fields.length > 0
  }
}

function toBuild(ref: PipelineRef, b: Raw): Build {
  return {
    org: ref.org,
    pipelineSlug: ref.slug,
    pipelineName: String(b.pipeline?.name ?? ref.slug),
    number: Number(b.number),
    state: String(b.state ?? ''),
    branch: String(b.branch ?? ''),
    message: String(b.message ?? '').split('\n')[0],
    author: String(b.creator?.name ?? b.author?.name ?? ''),
    createdAt: String(b.created_at ?? ''),
    startedAt: b.started_at ?? null,
    finishedAt: b.finished_at ?? null,
    webUrl: String(b.web_url ?? ''),
    jobs: Array.isArray(b.jobs) ? b.jobs.map(toJob) : []
  }
}

const newestFirst = (a: Build, b: Build) => Date.parse(b.createdAt) - Date.parse(a.createdAt)

/** Active builds first, then finished, each newest first, capped at 20. */
export function orderBuilds(builds: Build[]): Build[] {
  const active = builds.filter((b) => ACTIVE.includes(b.state)).sort(newestFirst)
  const finished = builds.filter((b) => !ACTIVE.includes(b.state)).sort(newestFirst)
  return [...active, ...finished].slice(0, LIMIT)
}

export function createBuilds(auth: Auth) {
  // Two cheap calls per pipeline: the newest builds, and the active ones (which may be older
  // than the newest 20).
  async function forPipeline(ref: PipelineRef, branch?: string): Promise<Result<Build[]>> {
    const base = `/v2/organizations/${ref.org}/pipelines/${ref.slug}/builds?per_page=${LIMIT}${
      branch ? `&branch=${encodeURIComponent(branch)}` : ''
    }`
    const active = ACTIVE.map((s) => `&state[]=${s}`).join('')
    const [recent, running] = await Promise.all([auth.request('GET', base), auth.request('GET', base + active)])
    if (!recent.ok) return recent
    if (!running.ok) return running
    const byNumber = new Map<number, Build>()
    for (const raw of [...(recent.value as Raw[]), ...(running.value as Raw[])]) {
      const build = toBuild(ref, raw)
      byNumber.set(build.number, build)
    }
    return { ok: true, value: [...byNumber.values()] }
  }

  function pickError(errors: BkError[]): BkError {
    const limited = errors.filter((e) => e.kind === 'rate_limited')
    if (limited.length === 0) return errors[0]
    return limited.reduce((a, b) => ((b.retryAfterSec ?? 0) > (a.retryAfterSec ?? 0) ? b : a))
  }

  async function list(input: ListInput): Promise<Result<Listed>> {
    const refs = Array.isArray(input?.pipelines) ? input.pipelines : []
    if (!refs.every((r) => SLUG.test(String(r?.org)) && SLUG.test(String(r?.slug)))) {
      return { ok: false, error: { kind: 'not_found', message: 'Unknown pipeline' } }
    }
    const branch = typeof input.branch === 'string' && input.branch ? input.branch : undefined
    const results = await Promise.all(refs.map((r) => forPipeline(r, branch)))
    const errors = results.flatMap((r) => (r.ok ? [] : [r.error]))
    if (errors.length > 0) return { ok: false, error: pickError(errors) }
    const builds = orderBuilds(results.flatMap((r) => (r.ok ? r.value : [])))
    return { ok: true, value: { builds, fetchedAt: new Date().toISOString() } }
  }

  return { list }
}
