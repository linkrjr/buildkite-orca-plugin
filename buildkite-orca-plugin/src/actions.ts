// Build actions: rebuild, cancel, unblock. Inputs come from the panel, so every path segment is
// validated here (the client's path guard is only a backstop). Refusals are never retried.
import type { OrcaWorkerApi } from 'orca/worker'
import type { Auth } from './auth'
import { blockStepHasFields, type BlockJobRef } from './block-fields'
import type { BkError, Result } from './protocol'

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/

type Target = { org: string; pipeline: string; number: number }

const fail = (error: BkError): Result<never> => ({ ok: false, error })
// Nothing was asked of Buildkite here; `not_found` is the closest kind in the contract.
const invalid = (): Result<never> => fail({ kind: 'not_found', message: "That build or job isn't valid" })

function buildPath(raw: unknown): { path: string; target: Target } | null {
  const t = raw as Partial<Target> | null | undefined
  if (!t || typeof t.org !== 'string' || typeof t.pipeline !== 'string') return null
  if (!SLUG.test(t.org) || !SLUG.test(t.pipeline)) return null
  if (typeof t.number !== 'number' || !Number.isSafeInteger(t.number) || t.number < 1) return null
  return { path: `/v2/organizations/${t.org}/pipelines/${t.pipeline}/builds/${t.number}`, target: t as Target }
}

export function registerActions(
  orca: OrcaWorkerApi,
  auth: Auth,
  hasFields: (job: BlockJobRef) => Promise<boolean> = blockStepHasFields
): void {
  const forbidden = (pipeline: string): Result<never> =>
    fail({
      kind: 'forbidden',
      message: `You don't have permission to do this on ${pipeline}`,
      pipeline
    })

  /** Runs `call` after the write-scope check; maps Buildkite's refusal to a per-pipeline error. */
  async function guarded<T>(pipeline: string, call: () => Promise<Result<T>>): Promise<Result<T>> {
    const status = await auth.status()
    if (status.state === 'signedIn' && !status.canWriteBuilds) return forbidden(pipeline)
    const result = await call()
    if (!result.ok && result.error.kind === 'forbidden') return forbidden(pipeline)
    return result
  }

  orca.panels.handle('builds.rebuild', async (input) => {
    const b = buildPath(input)
    if (!b) return invalid()
    return guarded(b.target.pipeline, async () => {
      const r = await auth.request('PUT', `${b.path}/rebuild`)
      if (!r.ok) return r
      const number = (r.value as { number?: unknown } | null)?.number
      if (typeof number !== 'number') {
        return fail({ kind: 'buildkite_error', message: 'Buildkite returned an error' })
      }
      return { ok: true, value: { number } }
    })
  })

  orca.panels.handle('builds.cancel', async (input) => {
    const b = buildPath(input)
    if (!b) return invalid()
    return guarded(b.target.pipeline, async () => {
      const r = await auth.request('PUT', `${b.path}/cancel`)
      return r.ok ? { ok: true, value: {} } : r
    })
  })

  orca.panels.handle('jobs.unblock', async (input) => {
    const b = buildPath(input)
    const jobId = (input as { jobId?: unknown } | null)?.jobId
    if (!b || typeof jobId !== 'string' || !JOB_ID.test(jobId)) return invalid()
    return guarded(b.target.pipeline, async () => {
      const build = await auth.request('GET', b.path)
      if (!build.ok) return build
      const jobs = (build.value as { jobs?: BlockJobRef[] }).jobs ?? []
      const job = jobs.find((j) => j.id === jobId)
      if (!job) return invalid()
      if (await hasFields(job)) {
        return fail({ kind: 'buildkite_error', message: 'This step has input fields. Unblock it in Buildkite' })
      }
      const r = await auth.request('PUT', `${b.path}/jobs/${jobId}/unblock`)
      return r.ok ? { ok: true, value: {} } : r
    })
  })
}
