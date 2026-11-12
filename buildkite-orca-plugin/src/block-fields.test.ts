import { assert, test } from 'orca/testing'
import { blockStepHasFields } from './block-fields'

test('blockStepHasFields answers true because Buildkite exposes no block-step fields to confirm otherwise', async () => {
  assert.equal(await blockStepHasFields({ id: 'j-1', graphql_id: 'Sm9iLS0tMQ==' }), true)
})
