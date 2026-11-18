import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assert, test } from 'orca/testing'
import { jobLabel } from './emoji'
import { BUILDKITE_EMOJI } from './emoji-data'

test('a Buildkite shortcode becomes an icon and leaves no text', () => {
  assert.deepEqual(jobLabel(':pipeline: Upload'), {
    icons: [{ name: 'pipeline', src: 'assets/emoji/pipeline.png' }],
    text: 'Upload'
  })
})

test('an alias resolves to the same image as its main name', () => {
  assert.deepEqual(jobLabel(':code-storage:').icons, [{ name: 'code-storage', src: 'assets/emoji/code-storage.png' }])
})

test('a standard shortcode becomes its Unicode emoji, kept in the text', () => {
  assert.deepEqual(jobLabel(':rocket: Deploy'), { icons: [], text: '🚀 Deploy' })
  assert.equal(jobLabel('Ship :thumbsup:').text, 'Ship 👍')
})

test('an unknown shortcode is removed and the leftover spaces collapse', () => {
  assert.deepEqual(jobLabel('Build :nope_not_real: app'), { icons: [], text: 'Build app' })
  assert.deepEqual(jobLabel(':nope_not_real:'), { icons: [], text: '' })
})

test('icons keep their order and repeat; shortcodes match case-insensitively', () => {
  const label = jobLabel(':docker::Docker: Build :pipeline:')
  assert.deepEqual(label.icons.map((i) => i.name), ['docker', 'docker', 'pipeline'])
  assert.equal(label.text, 'Build')
})

test('names without shortcodes are unchanged', () => {
  assert.deepEqual(jobLabel('Run tests'), { icons: [], text: 'Run tests' })
  assert.equal(jobLabel('Step: build').text, 'Step: build')
})

test('digit-only colon runs such as times are not treated as shortcodes', () => {
  assert.equal(jobLabel('Nightly 12:30:45').text, 'Nightly 12:30:45')
})

test('every Buildkite shortcode points at a bundled image', () => {
  const dir = fileURLToPath(new URL('../assets/emoji/', import.meta.url))
  const missing = Object.values(BUILDKITE_EMOJI).filter((file) => !existsSync(dir + file))
  assert.deepEqual(missing, [])
})
