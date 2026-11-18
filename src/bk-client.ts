// The one place that talks to Buildkite. The token goes only in the Authorization header of an
// HTTPS request to api.buildkite.com; messages in errors are fixed text, never echoing the token,
// headers, URLs or response bodies.
import type { BkError, Result } from './protocol'

const API = 'https://api.buildkite.com'

const fail = (error: BkError): Result<never> => ({ ok: false, error })

function mapStatus(status: number, headers: Headers): BkError {
  switch (status) {
    case 401:
      return { kind: 'token_invalid', message: 'Buildkite rejected this token', status }
    case 403:
      return { kind: 'forbidden', message: "Buildkite refused this request", status }
    case 404:
      return { kind: 'not_found', message: 'Buildkite could not find that', status }
    case 429: {
      const reset = Number(headers.get('RateLimit-Reset'))
      const retryAfterSec = Number.isFinite(reset) && reset > 0 ? reset : 1
      return { kind: 'rate_limited', message: 'Buildkite is rate limiting requests', status, retryAfterSec }
    }
    default:
      return { kind: 'buildkite_error', message: 'Buildkite returned an error', status }
  }
}

// Callers build paths from panel-supplied values; keep them on api.buildkite.com/v2 (a `?` query
// is allowed, but nothing that can change the host, the path root or add a fragment).
const SAFE_PATH = /^(?!.*(\/\/|[@\\#]))\/v2\/[\x21-\x7e]*$/

export async function bkRequest(
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<Result<unknown>> {
  if (!SAFE_PATH.test(path)) {
    return fail({ kind: 'buildkite_error', message: 'Buildkite returned an error' })
  }
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error'
    })
  } catch {
    return fail({ kind: 'network', message: "Can't reach Buildkite" })
  }
  if (!response.ok) return fail(mapStatus(response.status, response.headers))
  try {
    return { ok: true, value: await response.json() }
  } catch {
    return fail({ kind: 'buildkite_error', message: 'Buildkite returned an error', status: response.status })
  }
}
