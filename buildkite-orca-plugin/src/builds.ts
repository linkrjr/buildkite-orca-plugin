// builds.list: fetch each pipeline's builds (with jobs), map to the contract and order them.
import type { Auth } from './auth'
import { blockStepHasFields, type BlockJobRef } from './block-fields'
import { SLUG } from './actions'
import type { Build, BkError, Job, PipelineRef, Result } from './protocol'

const LIMIT = 20
const ACTIVE = ['running', 'scheduled', 'blocked', 'canceling']
const JOB_TYPES: Job['type'][] = ['script', 'manual', 'waiter', 'trigger']

type Raw = Record<string, any>
type ListInput = { pipelines: PipelineRef[]; branch?: string }
type Listed = { builds: Build[]; fetchedAt: string }

const firstLine = (v: unknown) => String(v ?? '').split('\n')[0]

// Manual (block) jobs carry `label`; script jobs carry `name`, or just a `command`.
function jobName(j: Raw): string {
  const pick = j.type === 'manual' ? [j.label, j.name] : [j.name, j.label, j.command]
  return firstLine(pick.find((v) => typeof v === 'string' && v) ?? j.type)
}

type HasFields = (job: BlockJobRef) => Promise<boolean>

// Only blocked manual jobs ask whether the step has input fields, which keeps polling cheap.
async function toJob(j: Raw, hasFields: HasFields): Promise<Job> {
  const type: Job['type'] = JOB_TYPES.includes(j.type) ? j.type : 'script'
  const blocked = type === 'manual' && j.state === 'blocked'
  return {
    id: String(j.id ?? ''),
    type,
    name: jobName(j),
    state: String(j.state ?? ''),
    unblockable: type === 'manual' && j.unblockable === true,
    hasFields: blocked ? await hasFields({ id: String(j.id ?? ''), graphql_id: j.graphql_id }) : false
  }
}

async function toBuild(ref: PipelineRef, b: Raw, hasFields: HasFields): Promise<Build> {
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
    jobs: Array.isArray(b.jobs) ? await Promise.all(b.jobs.map((j: Raw) => toJob(j, hasFields))) : []
  }
}

const newestFirst = (a: Build, b: Build) => Date.parse(b.createdAt) - Date.parse(a.createdAt)

/** Active builds first, then finished, each newest first, capped at 20. */
export function orderBuilds(builds: Build[]): Build[] {
  const active = builds.filter((b) => ACTIVE.includes(b.state)).sort(newestFirst)
  const finished = builds.filter((b) => !ACTIVE.includes(b.state)).sort(newestFirst)
  return [...active, ...finished].slice(0, LIMIT)
}

export function createBuilds(auth: Auth, hasFields: HasFields = blockStepHasFields) {
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
    // Later entries win, so the active call's fresher copy replaces the recent call's.
    const raws = [...(recent.value as Raw[]), ...(running.value as Raw[])]
    for (const build of await Promise.all(raws.map((raw) => toBuild(ref, raw, hasFields)))) {
      byNumber.set(build.number, build)
    }
    return { ok: true, value: [...byNumber.values()] }
  }

  function pickError(errors: BkError[]): BkError {
    // A rejected token matters most: it sends the panel back to sign-in.
    const rejected = errors.find((e) => e.kind === 'token_invalid')
    if (rejected) return rejected
    const limited = errors.filter((e) => e.kind === 'rate_limited')
    if (limited.length === 0) return errors[0]
    return limited.reduce((a, b) => ((b.retryAfterSec ?? 0) > (a.retryAfterSec ?? 0) ? b : a))
  }

  async function list(input: ListInput): Promise<Result<Listed>> {
    const given = Array.isArray(input?.pipelines) ? input.pipelines : []
    const isSlug = (v: unknown) => typeof v === 'string' && SLUG.test(v)
    if (!given.every((r) => isSlug(r?.org) && isSlug(r?.slug))) {
      return { ok: false, error: { kind: 'not_found', message: "That pipeline isn't valid" } }
    }
    const refs = [...new Map(given.map((r) => [`${r.org}/${r.slug}`, r])).values()]
    const branch = typeof input.branch === 'string' && input.branch ? input.branch : undefined
    const results = await Promise.all(refs.map((r) => forPipeline(r, branch)))
    const errors = results.flatMap((r) => (r.ok ? [] : [r.error]))
    if (errors.length > 0) return { ok: false, error: pickError(errors) }
    const builds = orderBuilds(results.flatMap((r) => (r.ok ? r.value : [])))
    return { ok: true, value: { builds, fetchedAt: new Date().toISOString() } }
  }

  return { list }
}
