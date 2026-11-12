// The signed-in body's project part: which pipelines the panel follows for the active workspace,
// the picker, and the pipeline filter. T7 reads `selectedPipelines` for its builds list.
import {
  atom,
  Box,
  Button,
  Callout,
  Checkbox,
  Code,
  derived,
  EmptyState,
  Input,
  plugin,
  read,
  Row,
  Select,
  set,
  Skeleton,
  Spinner,
  Stack,
  Text
} from 'orca'
import type { BkError, Pipeline, PipelineRef, Project } from './protocol'

const keyOf = (p: PipelineRef): string => `${p.org}/${p.slug}`
const ALL = 'all'

export const project = atom<Project | null>(null)
const loadError = atom<BkError | null>(null)
// Pipeline filter per workspace id, in plugin storage. Never written for an unresolvable id ('').
const prefs = atom<Record<string, { pipeline?: string }>>('panel.prefs', {}, { persist: 'storage' })
const unsavedFilter = atom(ALL)

const picking = atom(false)
const visible = atom<Pipeline[] | null>(null)
const picked = atom<string[]>([])
const query = atom('')
const saving = atom(false)
const saveError = atom<BkError | null>(null)

let loadSeq = 0

const workspaceId = (p: Project | null): string => p?.workspace?.id ?? ''

function currentFilter(p: Project | null): string {
  const stored = workspaceId(p) ? read(prefs)[workspaceId(p)]?.pipeline : read(unsavedFilter)
  return stored && p?.pipelines.some((x) => keyOf(x) === stored) ? stored : ALL
}

function setFilter(value: string): void {
  const id = workspaceId(read(project))
  if (!id) return set(unsavedFilter, value)
  set(prefs, { ...read(prefs), [id]: { pipeline: value } })
}

/** The pipelines whose builds the panel shows: the project's, narrowed by the pipeline filter. */
export const selectedPipelines = derived((): Pipeline[] => {
  const p = read(project)
  if (!p) return []
  const f = currentFilter(p)
  return f === ALL ? p.pipelines : p.pipelines.filter((x) => keyOf(x) === f)
})

function closePicker(): void {
  set(picking, false)
  set(query, '')
  set(saveError, null)
}

export function applyProject(next: Project): void {
  loadSeq++
  set(project, next)
  set(loadError, null)
  closePicker()
  set(visible, null)
  set(picked, [])
  // With no match the picker is the body, so its list is needed right away.
  if (next.source === 'none' && next.workspace?.id) void loadVisible()
}

export function resetProject(): void {
  loadSeq++
  set(project, null)
  set(loadError, null)
  closePicker()
  set(visible, null)
}

export async function loadProject(): Promise<void> {
  const seq = ++loadSeq
  set(project, null)
  set(loadError, null)
  try {
    const answer = await plugin.request('project.get')
    if (seq !== loadSeq) return
    if (answer.ok) applyProject(answer.value)
    else set(loadError, answer.error)
  } catch {
    if (seq === loadSeq) set(loadError, { kind: 'network', message: "Can't reach Buildkite" })
  }
}

async function loadVisible(): Promise<void> {
  const id = workspaceId(read(project))
  set(visible, null)
  try {
    const answer = await plugin.request('pipelines.visible', {})
    if (workspaceId(read(project)) !== id) return
    if (answer.ok) set(visible, answer.value)
    else set(saveError, answer.error)
  } catch {
    set(saveError, { kind: 'network', message: "Can't reach Buildkite" })
  }
}

function openPicker(): void {
  const p = read(project)
  set(picked, p ? p.pipelines.map(keyOf) : [])
  set(query, '')
  set(saveError, null)
  set(picking, true)
  void loadVisible()
}

async function choose(pipelines: PipelineRef[] | null): Promise<void> {
  const p = read(project)
  const id = workspaceId(p)
  if (!id || read(saving)) return
  set(saving, true)
  set(saveError, null)
  try {
    const answer = await plugin.request('project.choose', { workspaceId: id, pipelines })
    if (workspaceId(read(project)) !== id) return
    if (answer.ok) applyProject(answer.value)
    else set(saveError, answer.error)
  } catch {
    set(saveError, { kind: 'network', message: "Can't reach Buildkite" })
  } finally {
    set(saving, false)
  }
}

function matches(p: Pipeline, q: string): boolean {
  const needle = q.trim().toLowerCase()
  return !needle || [p.name, p.slug, p.org, p.orgName].some((s) => s.toLowerCase().includes(needle))
}

function Picker({ project: p, cancellable }: { project: Project; cancellable: boolean }) {
  const all = read(visible)
  const err = read(saveError)
  const sel = read(picked)
  const q = read(query)
  if (all === null) {
    return err ? (
      <Callout tone="danger" title={err.message} />
    ) : (
      <Stack gap="sm">
        <Spinner label="Loading pipelines" />
        <Skeleton shape="text" lines={3} label="Loading pipelines" />
      </Stack>
    )
  }
  if (all.length === 0) {
    return <EmptyState icon="info" title="Your token can't see any pipelines." />
  }
  const shown = all.filter((x) => matches(x, q))
  const orgs = [...new Set(shown.map((x) => x.org))]
  const busy = read(saving)
  const toggle = (key: string, on: boolean) =>
    set(picked, on ? [...sel.filter((k) => k !== key), key] : sel.filter((k) => k !== key))
  const refs = (): PipelineRef[] =>
    all.filter((x) => sel.includes(keyOf(x))).map((x) => ({ org: x.org, slug: x.slug }))
  return (
    <Stack gap="sm">
      <Text muted size="xs">
        Pick the pipelines to follow for this workspace.
      </Text>
      <Input
        type="search"
        label="Search pipelines"
        labelHidden
        placeholder="Search pipelines"
        value={q}
        onChange={(v) => set(query, v)}
      />
      <Box scroll="y" maxHeight={260}>
        <Stack gap="sm">
          {shown.length === 0 ? <Text muted>{`No pipelines match “${q}”`}</Text> : null}
          {orgs.map((org) => {
            const group = shown.filter((x) => x.org === org)
            return (
              <Stack key={org} gap="xs">
                <Text weight="semibold" size="xs">
                  {group[0].orgName}
                </Text>
                {group.map((x) => (
                  <Checkbox
                    key={keyOf(x)}
                    label={x.name}
                    description={keyOf(x)}
                    checked={sel.includes(keyOf(x))}
                    onChange={(on) => toggle(keyOf(x), on)}
                  />
                ))}
              </Stack>
            )
          })}
        </Stack>
      </Box>
      {err ? <Callout tone="danger" title={err.message} /> : null}
      <Row gap="xs" wrap>
        <Button
          variant="solid"
          tone="accent"
          disabled={sel.length === 0 || busy}
          onPress={() => void choose(refs())}
        >
          {cancellable ? `Save (${sel.length})` : `Show builds (${sel.length})`}
        </Button>
        {cancellable ? (
          <>
            <Button variant="ghost" disabled={busy} onPress={() => void choose(null)}>
              Use automatic matching
            </Button>
            <Button variant="ghost" disabled={busy} onPress={closePicker}>
              Cancel
            </Button>
          </>
        ) : null}
      </Row>
    </Stack>
  )
}

function Controls({ project: p }: { project: Project }) {
  const canChoose = workspaceId(p) !== ''
  const filter = currentFilter(p)
  return (
    <Stack gap="sm">
      <Row justify="between" wrap>
        <Text muted size="xs">
          {`Pipelines for this workspace · ${p.source === 'manual' ? 'chosen manually' : 'automatic match'}`}
        </Text>
        {canChoose ? (
          <Button variant="ghost" size="sm" icon="edit" onPress={openPicker}>
            Change pipelines
          </Button>
        ) : null}
      </Row>
      {!canChoose ? (
        <Text muted size="xs">
          Orca can't tell this workspace apart from another with the same name and branch, so a pipeline choice
          can't be saved.
        </Text>
      ) : null}
      {p.pipelines.length > 1 ? (
        <Select
          label="Pipeline"
          labelHidden
          value={filter}
          options={[
            { value: ALL, label: 'All matching pipelines' },
            ...p.pipelines.map((x) => ({ value: keyOf(x), label: keyOf(x) }))
          ]}
          onChange={setFilter}
        />
      ) : null}
    </Stack>
  )
}

export function ProjectArea() {
  const p = read(project)
  const err = read(loadError)
  if (err) {
    return (
      <Stack gap="sm">
        <Callout tone="danger" title={err.message} />
        <Button icon="refresh" tone="danger" onPress={() => void loadProject()}>
          Retry
        </Button>
      </Stack>
    )
  }
  if (p === null) {
    return (
      <Stack gap="sm">
        <Skeleton shape="text" lines={3} label="Loading project" />
      </Stack>
    )
  }
  if (p.workspace === null) {
    return <EmptyState icon="folder" title="Open a workspace to see its Buildkite builds." />
  }
  if (read(picking)) {
    return (
      <Stack gap="sm">
        <Text muted size="xs">{`Pipelines for this workspace · ${p.source === 'manual' ? 'chosen manually' : 'automatic match'}`}</Text>
        <Picker project={p} cancellable />
      </Stack>
    )
  }
  if (p.source === 'none') {
    return (
      <Stack gap="sm">
        <Callout tone="neutral" title="No Buildkite pipeline matches this project">
          {p.workspace.remote ? (
            <>
              Remote <Code>{p.workspace.remote}</Code>
            </>
          ) : (
            'This workspace has no git remote'
          )}
        </Callout>
        {p.workspace.id === '' ? (
          <Text muted size="xs">
            Orca can't tell this workspace apart from another with the same name and branch, so a pipeline choice
            can't be saved.
          </Text>
        ) : (
          <Picker project={p} cancellable={false} />
        )}
      </Stack>
    )
  }
  return (
    <Stack gap="sm">
      <Controls project={p} />
      <Text muted>Your builds will appear here.</Text>
    </Stack>
  )
}
