// The builds list: fetches `builds.list` for the selected pipelines, keeps it fresh while the
// panel is open, and draws every loading, empty and error state. Actions are T8's.
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
  type PanelContext
} from 'orca'
import {
  getPref,
  project,
  selectedPipelines,
  selectionListeners,
  setPref,
  workspaceId
} from './project-view'
import type { BkError, Build, Job, PipelineRef, Project } from './protocol'

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

let dataKey = ''
let seq = 0
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
      void refresh()
    }
  }, 1000)
}

function clearData(): void {
  seq++
  dataKey = ''
  stopCountdown()
  set(builds, null)
  set(fetchedAt, null)
  set(failure, null)
  set(loading, false)
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
  } else if (read(limitedUntil) > Date.now() || read(loading)) return
  const mine = ++seq
  set(loading, true)
  try {
    const answer = await plugin.request('builds.list', branch ? { pipelines: refs, branch } : { pipelines: refs })
    if (mine !== seq) return
    if (answer.ok) {
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
    }
  })
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

function JobRow({ job }: { job: Job }) {
  return (
    <Row justify="between" gap="xs" wrap>
      <Text truncate>{job.name}</Text>
      <Row gap="xs">
        <Badge tone={tone(job.state)}>{job.state}</Badge>
        {/* T8: per-job action slot (Unblock / Unblock in Buildkite) */}
      </Row>
    </Row>
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
            onPress={() => void host.call('shell.openExternal', { url: b.webUrl })}
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
        {/* T8: build action slot (Rebuild / Cancel and their confirmations) */}
        {b.jobs.length > 0 ? (
          <Collapsible title={`Jobs · ${b.jobs.length}`} open={expanded.includes(key)} onChange={toggle}>
            <Stack gap="xs">
              {b.jobs.map((j) => (
                <JobRow key={j.id} job={j} />
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
      error === null || error.kind === 'token_invalid' ? (
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
