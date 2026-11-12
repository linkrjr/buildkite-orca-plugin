import { assert, test } from 'orca/testing'
import { normalizeRemote, readGitRemote } from './remote'

const KEY = 'github.com/acme/web'

test('normalizes an https remote with a .git suffix', () => {
  assert.equal(normalizeRemote('https://github.com/acme/web.git'), KEY)
})

test('normalizes an https remote without a .git suffix', () => {
  assert.equal(normalizeRemote('https://github.com/acme/web'), KEY)
})

test('normalizes an scp-style ssh remote', () => {
  assert.equal(normalizeRemote('git@github.com:acme/web.git'), KEY)
})

test('normalizes an ssh:// remote with a user and a port', () => {
  assert.equal(normalizeRemote('ssh://git@github.com:22/acme/web.git'), KEY)
})

test('ignores a user and password in an https remote', () => {
  assert.equal(normalizeRemote('https://user:pw@github.com/acme/web.git'), KEY)
})

test('compares host, owner and repo case-insensitively', () => {
  assert.equal(normalizeRemote('git@GitHub.com:Acme/Web.GIT'), KEY)
})

test('ignores a trailing slash', () => {
  assert.equal(normalizeRemote('https://github.com/acme/web/'), KEY)
})

test('keeps a nested group path', () => {
  assert.equal(normalizeRemote('git@gitlab.com:grp/sub/web.git'), 'gitlab.com/grp/sub/web')
})

test('answers null for an empty or unparseable remote', () => {
  assert.equal(normalizeRemote(''), null)
  assert.equal(normalizeRemote(null), null)
  assert.equal(normalizeRemote('not a remote'), null)
})

type Node = { mkdtemp(p: string): Promise<string>; rm(p: string, o: object): Promise<void> }
const sh = async (cwd: string, ...args: string[]) => {
  const { execFileSync } = (await import('node:child_process' as string)) as { execFileSync(f: string, a: string[], o: object): unknown }
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}
async function withRepo(run: (dir: string) => Promise<void>) {
  const fs = (await import('node:fs/promises' as string)) as Node
  const os = (await import('node:os' as string)) as { tmpdir(): string }
  const dir = await fs.mkdtemp(`${os.tmpdir()}/bk-remote-`)
  try { await sh(dir, 'init', '-q'); await run(dir) } finally { await fs.rm(dir, { recursive: true, force: true }) }
}

test('reads the origin URL of a git checkout', () =>
  withRepo(async (dir) => {
    await sh(dir, 'remote', 'add', 'origin', 'git@github.com:acme/web.git')
    assert.equal(await readGitRemote(dir), 'git@github.com:acme/web.git')
  }))

test('answers null when the checkout has no origin', () =>
  withRepo(async (dir) => { assert.equal(await readGitRemote(dir), null) }))

test('answers null for an empty path', async () => {
  assert.equal(await readGitRemote(''), null)
})
