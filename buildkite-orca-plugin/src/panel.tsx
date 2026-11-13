// No build step: Orca strips the types and compiles the JSX when the panel loads.
import {
  atom,
  Button,
  Callout,
  Card,
  Field,
  Heading,
  IconButton,
  Input,
  Link,
  List,
  ListItem,
  plugin,
  read,
  Row,
  set,
  Spinner,
  Stack,
  Text,
  type PanelContext
} from 'orca'
import type { AuthState, BkError } from './protocol'
import { RefreshControls, StaleBadge, startBuilds, UpdatedAt } from './builds-view'
import { applyProject, loadProject, ProjectArea, resetProject } from './project-view'

// None of these is persisted. The token only ever lives in the field's draft until submit.
const auth = atom<AuthState | null>(null)
const draft = atom('')
const submitting = atom(false)
const formError = atom<BkError | null>(null)
const menuOpen = atom(false)
const replacing = atom(false)

function applyAuth(next: AuthState): void {
  set(auth, next)
  set(formError, null)
  set(menuOpen, false)
  if (next.state === 'signedOut') {
    set(replacing, false)
    resetProject()
  } else void loadProject()
}

/** Sends the draft to the worker and clears it right away; the answer never carries the token. */
async function submitToken(): Promise<void> {
  const token = read(draft)
  if (!token.trim() || read(submitting)) return
  set(draft, '')
  set(formError, null)
  set(submitting, true)
  try {
    const answer = await plugin.request('auth.signIn', { token })
    if (answer.ok) {
      applyAuth(answer.value)
      set(replacing, false)
    } else {
      set(formError, answer.error)
    }
  } catch {
    set(formError, { kind: 'network', message: "Can't reach Buildkite" })
  } finally {
    set(submitting, false)
  }
}

async function signOut(): Promise<void> {
  set(menuOpen, false)
  applyAuth(await plugin.request('auth.signOut'))
}

export function setup(ctx: PanelContext): void {
  startBuilds(ctx)
  ctx.subscriptions.push(plugin.on('auth.changed', applyAuth))
  ctx.subscriptions.push(
    plugin.on('project.changed', (next) => {
      if (read(auth)?.state === 'signedIn') applyProject(next)
    })
  )
  void plugin.request('auth.status').then(applyAuth)
}

function ErrorNotice({ error }: { error: BkError }) {
  if (error.kind === 'token_invalid') return null
  if (error.kind === 'network') {
    return (
      <Callout tone="danger" title="Can't reach Buildkite">
        Check your connection and try again. Your token was not saved.
      </Callout>
    )
  }
  return (
    <Callout tone="danger" title={error.message} />
  )
}

function TokenInput({ label }: { label: string }) {
  const error = read(formError)
  const busy = read(submitting)
  return (
    <Field label={label} error={error?.kind === 'token_invalid' ? error.message : undefined}>
      <Input
        label={label}
        labelHidden
        type="password"
        placeholder="bkua_…"
        value={read(draft)}
        invalid={error?.kind === 'token_invalid'}
        disabled={busy}
        onChange={(value) => set(draft, value)}
        onSubmit={() => void submitToken()}
      />
    </Field>
  )
}

function SubmitButton({ idle }: { idle: string }) {
  return (
    <Button variant="solid" tone="accent" disabled={read(submitting)} onPress={() => void submitToken()}>
      {read(submitting) ? <Spinner label="Signing in" /> : null}
      {read(submitting) ? 'Signing in…' : idle}
    </Button>
  )
}

function SignedOut({ reason }: { reason?: 'token_rejected' }) {
  const error = read(formError)
  return (
    <Stack gap="md">
      <Heading level={2}>Buildkite</Heading>
      {reason === 'token_rejected' ? (
        <Callout tone="warning" title="Your Buildkite token is no longer valid">
          It may have been revoked or expired. Sign in with a new token.
        </Callout>
      ) : null}
      {error ? <ErrorNotice error={error} /> : null}
      <Text muted>Sign in with a Buildkite API token to see your builds.</Text>
      <TokenInput label="Buildkite API token" />
      <SubmitButton idle="Sign in" />
      <Text muted size="xs">
        The token needs read access to user, organizations, pipelines and builds. Add write builds to enable
        Rebuild, Cancel and Unblock.
      </Text>
      <Link href="https://buildkite.com/user/api-access-tokens">Open Buildkite API token page</Link>
    </Stack>
  )
}

function ReplaceToken() {
  const error = read(formError)
  return (
    <Card title="Replace token">
      <Stack gap="sm">
        {error ? <ErrorNotice error={error} /> : null}
        {error?.kind === 'token_invalid' ? (
          <Callout tone="neutral" title="Your current token is still in use" />
        ) : null}
        <TokenInput label="New Buildkite API token" />
        <Text muted size="xs">
          Your current token stays in use until the new one is accepted.
        </Text>
        <Row gap="xs">
          <SubmitButton idle="Validate and replace" />
          <Button
            variant="ghost"
            disabled={read(submitting)}
            onPress={() => {
              set(replacing, false)
              set(formError, null)
              set(draft, '')
            }}
          >
            Cancel
          </Button>
        </Row>
      </Stack>
    </Card>
  )
}

function SignedIn({ name }: { name: string }) {
  return (
    <Stack gap="md">
      <Row justify="between">
        <Row gap="xs">
          <Heading level={2}>Buildkite</Heading>
          <StaleBadge />
        </Row>
        <Row gap="xs">
          <RefreshControls />
          <IconButton
            icon="more"
            label="Account"
            onPress={() => set(menuOpen, !read(menuOpen))}
          />
        </Row>
      </Row>
      <Text muted size="xs">
        Signed in as <Text weight="semibold">{name}</Text>
        <UpdatedAt />
      </Text>
      {read(menuOpen) ? (
        <Card>
          <List label="Account">
            <ListItem
              icon="edit"
              title="Replace token"
              onPress={() => {
                set(menuOpen, false)
                set(formError, null)
                set(draft, '')
                set(replacing, true)
              }}
            />
            <ListItem icon="close" title="Sign out" onPress={() => void signOut()} />
          </List>
        </Card>
      ) : null}
      {read(replacing) ? <ReplaceToken /> : <ProjectArea />}
    </Stack>
  )
}

export default function Panel() {
  const state = read(auth)
  if (state === null) return <Spinner label="Loading" />
  if (state.state === 'signedOut') return <SignedOut reason={state.reason} />
  return <SignedIn name={state.user.name} />
}
