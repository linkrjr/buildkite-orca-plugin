// The plugin's own worker. Orca starts it on the panel's first plugin.request and transpiles
// this file when it loads: no build step. A save restarts it and drops its in-memory state, so
// what must last lives in orca.storage (the storage:own capability).
import type { OrcaWorkerApi } from 'orca/worker'
import { createAuth } from './auth'
import { registerActions } from './actions'
import { registerProject } from './project'

export default function activate(orca: OrcaWorkerApi): void {
  const auth = createAuth(orca)
  orca.panels.handle('auth.status', () => auth.status())
  orca.panels.handle('auth.signIn', (input) => auth.signIn(input?.token))
  orca.panels.handle('auth.signOut', () => auth.signOut())
  registerActions(orca, auth)
  registerProject(orca, auth)
}
