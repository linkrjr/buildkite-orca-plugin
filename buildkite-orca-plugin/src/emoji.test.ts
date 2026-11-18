import { existsSync, readFileSync } from 'node:fs'
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

test('colon-separated text is not a shortcode: times and command names stay as written', () => {
  for (const name of ['Nightly 12:30:45', 'yarn test:unit:ci', 'rake db:schema:load', 'bundle exec rake db:migrate:reset', 'deploy:staging:eu']) {
    assert.deepEqual(jobLabel(name), { icons: [], text: name }, name)
  }
  const lint = jobLabel('npm run lint:js:fix')
  assert.deepEqual(lint, { icons: [], text: 'npm run lint:js:fix' })
})

test('a shortcode next to punctuation or another shortcode still matches', () => {
  assert.deepEqual(jobLabel(':rocket:, go (:docker:)'), {
    icons: [{ name: 'docker', src: 'assets/emoji/docker.png' }],
    text: '🚀, go ()'
  })
  assert.deepEqual(jobLabel(':docker::pipeline:').icons.map((i) => i.name), ['docker', 'pipeline'])
})

test('a shortcode with a dot matches (:quay.io:)', () => {
  assert.deepEqual(jobLabel(':quay.io: Push'), {
    icons: [{ name: 'quay.io', src: 'assets/emoji/quay.png' }],
    text: 'Push'
  })
})

test('shortcodes whose image Orca cannot show are removed, never printed', () => {
  assert.deepEqual(jobLabel(':partyparrot: Party :buildkite-party:'), { icons: [], text: 'Party' })
})

test('every Buildkite shortcode points at a bundled image in a format Orca accepts', () => {
  const dir = fileURLToPath(new URL('../assets/emoji/', import.meta.url))
  const files = Object.values(BUILDKITE_EMOJI)
  assert.deepEqual(files.filter((file) => !existsSync(dir + file)), [])
  assert.deepEqual(files.filter((file) => !/\.(?:png|jpe?g|webp)$/i.test(file)), [])
})

test('every bundled image is a transparent PNG on a 3:1 canvas, so Orca shows each icon at the same size', () => {
  const dir = fileURLToPath(new URL('../assets/emoji/', import.meta.url))
  const odd: string[] = []
  for (const file of new Set(Object.values(BUILDKITE_EMOJI))) {
    const bytes = readFileSync(dir + file)
    const head = new DataView(bytes.buffer, bytes.byteOffset, 26)
    const png = head.getUint32(0) === 0x89504e47 && head.getUint32(4) === 0x0d0a1a0a
    const rgba = head.getUint8(25) === 6
    if (!png || !rgba || head.getUint32(16) !== 3 * head.getUint32(20)) odd.push(file)
  }
  assert.deepEqual(odd, [])
})
