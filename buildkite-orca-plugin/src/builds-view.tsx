// The builds list: fetches `builds.list` for the selected pipelines, keeps it fresh while the
// panel is open, and draws every loading, empty and error state, plus the row actions.
import {
  atom,
  Badge,
  Button,
  Callout,
  Card,
  Code,
  Collapsible,
  EmptyState,
  host,
  IconButton,
  plugin,
  read,
  RelativeTime,
  Row,
  set,
  Skeleton,
  Spinner,
  Stack,
  Switch,
  Text,
  type PanelContext,
  type ReadonlyAtom
} from 'orca'
import {
  getPref,
  project,
  selectedPipelines,
  selectionListeners,
  setPref,
  workspaceId
} from './project-view'
import type { BkError, Build, Job, PipelineRef, Project, Result } from './protocol'

const POLL_MS = 15_000
const DEFAULT_RETRY_SEC = 60
const MAX_EXPANDED = 100

const builds = atom<Build[] | null>(null)
const fetchedAt = atom<string | null>(null)
const failure = atom<BkError | null>(null)
const loading = atom(false)
// Wall clock in ms: ticks once a second, only while rate limited, to drive the countdown.
const now = atom(0)
const limitedUntil = atom(0)

/** Set by the panel from `AuthState.canWriteBuilds`; the action buttons are hidden without it. */
export const canWriteBuilds = atom(false)
// Per build row: a pending confirmation, the running action, and the last note or error. The
// confirm/running targets are 'rebuild' | 'cancel' | `unblock:<jobId>`.
// `rebuilt` is the key of the build a Rebuild started, so its note ends once that build is listed.
type RowState = { confirm?: string; running?: string; note?: string; rebuilt?: string; error?: string }
const rows = atom<Record<string, RowState>>({})
const FINISHED = new Set(['passed', 'failed', 'canceled', 'skipped', 'not_run'])
const ACTIVE = new Set(['running', 'scheduled', 'blocked'])

let dataKey = ''
let seq = 0
let inflight: Promise<void> | null = null
let visibleAtom: ReadonlyAtom<boolean> | null = null
let wasVisible = true
const isVisible = (): boolean => visibleAtom === null || read(visibleAtom)
let countdown: ReturnType<typeof setInterval> | undefined

const keyOf = (p: PipelineRef): string => `${p.org}/${p.slug}`
const buildKey = (b: Build): string => `${b.org}/${b.pipelineSlug}#${b.number}`

function effectiveBranch(p: Project | null): string | undefined {
  return getPref(p, 'branchOnly') === true && p?.workspace?.branch ? p.workspace.branch : undefined
}

function stopCountdown(): void {
  if (countdown !== undefined) clearInterval(countdown)
  countdown = undefined
  set(limitedUntil, 0)
}

function startCountdown(seconds: number): void {
  if (countdown !== undefined) clearInterval(countdown)
  set(now, Date.now())
  set(limitedUntil, Date.now() + seconds * 1000)
  countdown = setInterval(() => {
    set(now, Date.now())
    if (Date.now() >= read(limitedUntil)) {
      stopCountdown()
      if (read(failure)?.kind === 'rate_limited') set(failure, null)
      void refresh()
    }
  }, 1000)
}

function clearData(): void {
  seq++
  dataKey = ''
  // The rate limit is account-wide: it outlives a changed selection, so its notice stays.
  set(builds, null)
  set(fetchedAt, null)
  if (read(failure)?.kind !== 'rate_limited') set(failure, null)
  set(loading, false)
}

/** After an action: waits for a poll already in flight (it may predate the action), then loads again. */
async function refreshFresh(): Promise<void> {
  if (inflight) await inflight.catch(() => undefined)
  await refresh()
}

/**
 * Drops a row's confirmation, note and error once a refresh changed that build's state (or
 * removed it), and a rebuild note once the new build is listed. A running action is kept.
 */
function reconcileRows(prev: Build[] | null, next: Build[]): void {
  const current = read(rows)
  const before = new Map((prev ?? []).map((b) => [buildKey(b), b.state]))
  const after = new Map(next.map((b) => [buildKey(b), b.state]))
  const out: Record<string, RowState> = {}
  for (const [key, st] of Object.entries(current)) {
    if (st.running !== undefined) {
      out[key] = st
      continue
    }
    const now = after.get(key)
    if (now === undefined) continue
    if (before.get(key) !== now) continue
    out[key] = st.rebuilt !== undefined && after.has(st.rebuilt) ? { ...st, note: undefined, rebuilt: undefined } : st
  }
  set(rows, out)
}

/** Loads the list for the current selection. A changed selection clears what was shown first. */
export async function refresh(): Promise<void> {
  const p = read(project)
  const pipelines = read(selectedPipelines)
  if (!p?.workspace || pipelines.length === 0) return clearData()
  const refs = pipelines.map((x) => ({ org: x.org, slug: x.slug }))
  const branch = effectiveBranch(p)
  const key = JSON.stringify([workspaceId(p), refs, branch ?? null])
  if (key !== dataKey) {
    clearData()
    dataKey = key
  } else if (read(loading)) return
  // Nothing is requested while hidden or rate limited; becoming visible / the countdown ending refreshes.
  if (!isVisible() || read(limitedUntil) > Date.now()) return
  const run = load(refs, branch)
  inflight = run
  try {
    await run
  } finally {
    if (inflight === run) inflight = null
  }
}

async function load(refs: PipelineRef[], branch: string | undefined): Promise<void> {
  const mine = ++seq
  set(loading, true)
  try {
    const answer = await plugin.request('builds.list', branch ? { pipelines: refs, branch } : { pipelines: refs })
    if (mine !== seq) return
    if (answer.ok) {
      reconcileRows(read(builds), answer.value.builds)
      set(builds, answer.value.builds)
      set(fetchedAt, answer.value.fetchedAt)
      set(failure, null)
      stopCountdown()
    } else if (answer.error.kind === 'rate_limited') {
      set(failure, answer.error)
      startCountdown(answer.error.retryAfterSec ?? DEFAULT_RETRY_SEC)
    } else if (answer.error.kind === 'token_invalid') {
      // auth.changed takes the panel back to sign-in.
      set(failure, null)
    } else set(failure, answer.error)
  } catch {
    if (mine === seq) set(failure, { kind: 'network', message: "Can't reach Buildkite" })
  } finally {
    if (mine === seq) set(loading, false)
  }
}

/** Starts polling and reloading on selection changes; everything ends with the panel. */
export function startBuilds(ctx: PanelContext): void {
  dataKey = ''
  seq++
  countdown = undefined
  visibleAtom = ctx.visible
  wasVisible = true
  const poll = setInterval(() => {
    if (read(ctx.visible) && read(limitedUntil) <= Date.now()) void refresh()
  }, POLL_MS)
  const onSelection = () => void refresh()
  selectionListeners.add(onSelection)
  ctx.subscriptions.push({
    dispose() {
      clearInterval(poll)
      selectionListeners.delete(onSelection)
      if (countdown !== undefined) clearInterval(countdown)
      countdown = undefined
      seq++
      visibleAtom = null
    }
  })
}

/** Renders nothing; refreshes once each time the panel becomes visible again. */
function VisibilityWatch() {
  const visible = isVisible()
  if (visible && !wasVisible) queueMicrotask(() => void refresh())
  wasVisible = visible
  return null
}

const TONES: Record<string, 'accent' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  running: 'accent',
  blocked: 'warning',
  canceling: 'warning',
  passed: 'success',
  failed: 'danger'
}
const tone = (state: string) => TONES[state] ?? 'neutral'
const ms = (iso: string | null): number => (iso ? Date.parse(iso) : NaN)

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const m = Math.floor(s / 60)
  return m === 0 ? `${s}s` : `${m}m ${s % 60}s`
}

function BuildTimes({ b }: { b: Build }) {
  const started = ms(b.startedAt)
  if (Number.isNaN(started)) {
    const created = ms(b.createdAt)
    return Number.isNaN(created) ? null : (
      <>
        created <RelativeTime at={created} format="short" />
      </>
    )
  }
  const finished = ms(b.finishedAt)
  return (
    <>
      started <RelativeTime at={started} format="short" />
      {b.state === 'running' ? (
        <>
          {' · '}
          <RelativeTime at={started} format="duration" />
        </>
      ) : Number.isNaN(finished) ? null : (
        ` · ${formatDuration((finished - started) / 1000)}`
      )}
    </>
  )
}

function rowState(b: Build): RowState {
  return read(rows)[buildKey(b)] ?? {}
}
function patchRow(b: Build, next: RowState): void {
  set(rows, { ...read(rows), [buildKey(b)]: next })
}

/** Runs one action on a row. Success refreshes the list; a failure stays on the row, never retried. */
async function runAction(b: Build, target: string, call: () => Promise<Result<unknown>>): Promise<void> {
  // A second press delivered before the host re-renders the disabled button must not repeat it.
  if (rowState(b).running !== undefined) return
  patchRow(b, { running: target })
  try {
    const answer = await call()
    if (answer.ok) {
      // The row stays busy until the refreshed list is in, so it never shows its old state as actionable.
      await refreshFresh()
      const started = target === 'rebuild' ? (answer.value as { number?: unknown } | null)?.number : undefined
      const listed = typeof started === 'number' && (read(builds) ?? []).some((x) => buildKey(x) === `${b.org}/${b.pipelineSlug}#${started}`)
      patchRow(
        b,
        typeof started === 'number' && !listed
          ? {
              note: `Rebuild started as #${started} — it will appear on the next refresh.`,
              rebuilt: `${b.org}/${b.pipelineSlug}#${started}`
            }
          : {}
      )
    } else if (answer.error.kind === 'token_invalid') {
      // auth.changed takes the panel back to sign-in.
      patchRow(b, {})
    } else {
      patchRow(b, {
        error:
          answer.error.kind === 'network'
            ? "Can't reach Buildkite. Nothing was changed."
            : answer.error.kind === 'forbidden'
              ? `You don't have permission to do this on ${label(b)}`
              : answer.error.message
      })
    }
  } catch {
    patchRow(b, { error: "Can't reach Buildkite. Nothing was changed." })
  }
}

const target = (b: Build) => ({ org: b.org, pipeline: b.pipelineSlug, number: b.number })
const label = (b: Build) => `${b.org}/${b.pipelineSlug}`

/** The build's page, only if it is an https buildkite.com URL; anything else is never opened. */
function buildUrl(b: Build): string | null {
  try {
    const u = new URL(b.webUrl)
    return u.protocol === 'https:' && (u.hostname === 'buildkite.com' || u.hostname.endsWith('.buildkite.com')) ? u.href : null
  } catch {
    return null
  }
}
/** Opens the build in the browser; Orca's refusal (e.g. the user declines a new host) is dropped. */
function openBuild(b: Build): void {
  const url = buildUrl(b)
  if (url) host.call('shell.openExternal', { url }).catch(() => undefined)
}
// Stale rows (a network failure over old data) can't be acted on.
const actionsDisabled = (): boolean => {
  const error = read(failure)
  return error !== null && error.kind !== 'rate_limited' && read(builds) !== null
}

function Confirm({ title, body, yes, no, tone: t, disabled, onYes, onNo }: {
  title: string
  body: string
  yes: string
  no: string
  tone: 'danger' | 'accent'
  disabled: boolean
  onYes: () => void
  onNo: () => void
}) {
  return (
    <Callout tone="warning" title={title}>
      <Stack gap="xs">
        <Text size="xs">{body}</Text>
        <Row gap="xs">
          <Button size="sm" variant="solid" tone={t} disabled={disabled} onPress={onYes}>
            {yes}
          </Button>
          <Button size="sm" variant="ghost" onPress={onNo}>
            {no}
          </Button>
        </Row>
      </Stack>
    </Callout>
  )
}

function BuildActions({ b }: { b: Build }) {
  if (!read(canWriteBuilds)) return null
  const st = rowState(b)
  const rebuild = FINISHED.has(b.state)
  const cancel = ACTIVE.has(b.state)
  const busy = st.running !== undefined || actionsDisabled()
  return (
    <Stack gap="xs">
      {st.confirm === 'cancel' ? (
        <Confirm
          title={`Cancel build #${b.number} on ${label(b)}?`}
          body="Running jobs will be stopped."
          yes="Cancel build"
          no="Keep running"
          tone="danger"
          disabled={busy}
          onYes={() => void runAction(b, 'cancel', () => plugin.request('builds.cancel', target(b)))}
          onNo={() => patchRow(b, {})}
        />
      ) : rebuild || cancel ? (
        <Row gap="xs">
          {rebuild ? (
            <Button
              size="sm"
              icon="refresh"
              disabled={busy}
              onPress={() => void runAction(b, 'rebuild', () => plugin.request('builds.rebuild', target(b)))}
            >
              {st.running === 'rebuild' ? 'Rebuilding…' : 'Rebuild'}
            </Button>
          ) : (
            <Button size="sm" tone="danger" disabled={busy} onPress={() => patchRow(b, { confirm: 'cancel' })}>
              {st.running === 'cancel' ? 'Cancelling…' : 'Cancel'}
            </Button>
          )}
          {st.running === 'rebuild' || st.running === 'cancel' ? <Spinner label="Working" labelHidden /> : null}
        </Row>
      ) : null}
      {st.note ? (
        <Text tone="success" size="xs">
          {st.note}
        </Text>
      ) : null}
      {st.error ? (
        <Text tone="danger" size="xs">
          {`⚠ ${st.error}`}
        </Text>
      ) : null}
    </Stack>
  )
}

function JobRow({ job, b }: { job: Job; b: Build }) {
  const unblockable = read(canWriteBuilds) && job.unblockable && job.state === 'blocked'
  const id = `unblock:${job.id}`
  const st = rowState(b)
  const busy = st.running !== undefined || actionsDisabled()
  return (
    <Stack gap="xs">
      <Row justify="between" gap="xs" wrap>
        <Text truncate>{job.name}</Text>
        <Row gap="xs">
          <Badge tone={tone(job.state)}>{job.state}</Badge>
          {unblockable && job.hasFields ? (
            <Button
              size="sm"
              variant="ghost"
              icon="open-external"
              disabled={buildUrl(b) === null}
              onPress={() => openBuild(b)}
            >
              Unblock in Buildkite
            </Button>
          ) : null}
          {unblockable && !job.hasFields && st.confirm !== id ? (
            <Button size="sm" tone="accent" disabled={busy} onPress={() => patchRow(b, { confirm: id })}>
              {st.running === id ? 'Unblocking…' : 'Unblock'}
            </Button>
          ) : null}
          {st.running === id ? <Spinner label="Working" labelHidden /> : null}
        </Row>
      </Row>
      {unblockable && st.confirm === id ? (
        <Confirm
          title={`Unblock “${job.name}” on ${label(b)}?`}
          body={`Build #${b.number} will continue past this step.`}
          yes="Unblock"
          no="Not now"
          tone="accent"
          disabled={busy}
          onYes={() =>
            void runAction(b, id, () => plugin.request('jobs.unblock', { ...target(b), jobId: job.id }))
          }
          onNo={() => patchRow(b, {})}
        />
      ) : null}
    </Stack>
  )
}

function BuildCard({ b }: { b: Build }) {
  const p = read(project)
  const key = buildKey(b)
  const expanded = getPref(p, 'expanded') ?? []
  const toggle = (open: boolean) =>
    setPref('expanded', open ? [...expanded.filter((k) => k !== key), key].slice(-MAX_EXPANDED) : expanded.filter((k) => k !== key))
  return (
    <Card>
      <Stack gap="xs">
        <Row justify="between" gap="xs">
          <Row gap="xs">
            <Badge tone={tone(b.state)}>{b.state}</Badge>
            <Text weight="semibold">{`#${b.number}`}</Text>
            <Text muted size="xs" truncate>{`${b.org}/${b.pipelineSlug}`}</Text>
          </Row>
          <IconButton
            icon="open-external"
            label={`Open build #${b.number} in Buildkite`}
            size="sm"
            disabled={buildUrl(b) === null}
            onPress={() => openBuild(b)}
          />
        </Row>
        <Text weight="medium" truncate>
          {b.message}
        </Text>
        <Text muted size="xs">
          <Code>{b.branch}</Code>
          {` · ${b.author} · `}
          <BuildTimes b={b} />
        </Text>
        <BuildActions b={b} />
        {b.jobs.length > 0 ? (
          <Collapsible title={`Jobs · ${b.jobs.length}`} open={expanded.includes(key)} onChange={toggle}>
            <Stack gap="xs">
              {b.jobs.map((j) => (
                <JobRow key={j.id} job={j} b={b} />
              ))}
            </Stack>
          </Collapsible>
        ) : null}
      </Stack>
    </Card>
  )
}

const copy = (error: BkError): string =>
  error.kind === 'network' ? "Can't reach Buildkite" : error.message

function Banner() {
  const error = read(failure)
  if (!error) return null
  if (error.kind !== 'rate_limited' && read(loading) && read(builds) === null) return null
  if (error.kind === 'rate_limited') {
    const left = Math.max(0, Math.ceil((read(limitedUntil) - read(now)) / 1000))
    return (
      <Callout tone="warning" title={`Rate limited, retrying in ${left}s`}>
        Buildkite asked us to slow down.
      </Callout>
    )
  }
  return (
    <Stack gap="sm">
      <Callout tone="danger" title={copy(error)}>
        {read(builds) !== null && read(fetchedAt) ? (
          <>
            Showing builds from <RelativeTime at={Date.parse(read(fetchedAt) as string)} format="short" />.
          </>
        ) : null}
      </Callout>
      <Row>
        <Button icon="refresh" tone="danger" onPress={() => void refresh()}>
          Retry
        </Button>
      </Row>
    </Stack>
  )
}

function emptyTitle(p: Project): string {
  const branch = effectiveBranch(p)
  if (branch) return `No builds on ${branch}`
  const pipelines = read(selectedPipelines)
  return pipelines.length === 1 ? `No builds yet for ${keyOf(pipelines[0])}` : 'No builds yet for the matching pipelines'
}

function BranchToggle({ p }: { p: Project }) {
  const branch = p.workspace?.branch ?? null
  return (
    <Stack gap="xs">
      <Row justify="between" wrap>
        <Row gap="xs">
          <Switch
            label="This branch only"
            checked={branch !== null && getPref(p, 'branchOnly') === true}
            disabled={branch === null}
            onChange={(on) => {
              setPref('branchOnly', on)
              void refresh()
            }}
          />
          {branch === null ? (
            <IconButton
              icon="info"
              label="Why is this disabled?"
              size="sm"
              tooltip="No branch is checked out (detached HEAD), so there is no branch to filter by."
            />
          ) : (
            <Code>{branch}</Code>
          )}
        </Row>
      </Row>
      {branch === null ? (
        <Text muted size="xs">
          No branch is checked out (detached HEAD), so there is no branch to filter by.
        </Text>
      ) : null}
    </Stack>
  )
}

export function BuildsArea({ project: p }: { project: Project }) {
  const list = read(builds)
  const error = read(failure)
  let body
  if (list === null) {
    body =
      error === null || error.kind === 'token_invalid' || read(loading) ? (
        <Stack gap="sm">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <Skeleton shape="text" lines={3} label="Loading builds" />
            </Card>
          ))}
        </Stack>
      ) : null
  } else if (list.length === 0) {
    body = <EmptyState icon="package" title={emptyTitle(p)} />
  } else {
    body = (
      <Stack gap="sm">
        {list.map((b) => (
          <BuildCard key={buildKey(b)} b={b} />
        ))}
      </Stack>
    )
  }
  return (
    <Stack gap="sm">
      <VisibilityWatch />
      <BranchToggle p={p} />
      <Banner />
      {body}
    </Stack>
  )
}

/** Refresh button and in-flight spinner, for the panel header. */
export function RefreshControls() {
  const p = read(project)
  const ready = p?.workspace != null && read(selectedPipelines).length > 0
  const limited = read(failure)?.kind === 'rate_limited'
  const busy = read(loading)
  return (
    <Row gap="xs">
      {busy && read(builds) !== null ? <Spinner label="Refreshing" labelHidden /> : null}
      <IconButton
        icon="refresh"
        label="Refresh"
        disabled={!ready || busy || limited}
        onPress={() => void refresh()}
      />
    </Row>
  )
}

/** "Updated Ns ago", plus the Stale badge while a network error hides fresh data. */
export function UpdatedAt() {
  const at = read(fetchedAt)
  if (!at) return null
  return (
    <>
      {' · Updated '}
      <RelativeTime at={Date.parse(at)} format="short" />
    </>
  )
}

export function StaleBadge() {
  const error = read(failure)
  return read(builds) !== null && error && error.kind !== 'rate_limited' ? <Badge tone="warning">Stale</Badge> : null
}

export function ReadOnlyBadge() {
  return read(canWriteBuilds) ? null : <Badge tone="neutral">Read-only</Badge>
}
