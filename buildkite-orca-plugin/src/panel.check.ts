// `orca plugin check` renders the panel once per scenario, each with the worker on a fresh
// host. Seed what the worker reads so check shows more than the first state.
// The token-rejected notice only follows an `auth.changed` event, which check cannot deliver
// (it replays Orca events only); src/panel.test.tsx covers it.
import { defineCheck } from 'orca/testing'

export default defineCheck({
  signedOut: {},
  signedIn: {
    secrets: { token: 'bkua_fake_check_token' },
    storage: { 'auth.profile': { user: { name: 'Ana Souza' }, canWriteBuilds: true } }
  }
})
