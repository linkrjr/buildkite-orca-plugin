// AC5 harness. Every backend task adds its flows to src/leak.test.ts: run them through
// `harness.call(...)`, then `harness.assertClean()` checks that the known token appears in no
// answer, event, log line, console/terminal output or non-secret storage/settings.
import type { MockHost, TestWorker } from 'orca/testing'
import { assert } from 'orca/testing'

// The plugin tsconfig has no Node typings; tests run in Node, so reach `process` through a cast.
declare const process: {
  stdout: { write: (chunk: unknown) => boolean }
  stderr: { write: (chunk: unknown) => boolean }
}

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'
const METHODS: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug']

export function createLeakHarness(token: string, worker: TestWorker, host: MockHost) {
  const answers: unknown[] = []
  const terminal: string[] = []
  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>()
  const stdout = process.stdout.write.bind(process.stdout)
  const stderr = process.stderr.write.bind(process.stderr)
  for (const m of METHODS) {
    originals.set(m, console[m])
    console[m] = (...args: unknown[]) => { terminal.push(args.map(String).join(' ')) }
  }
  const capture = (chunk: unknown) => { terminal.push(String(chunk)); return true }
  process.stdout.write = capture
  process.stderr.write = capture

  const restore = () => {
    for (const m of METHODS) console[m] = originals.get(m)!
    process.stdout.write = stdout
    process.stderr.write = stderr
  }

  return {
    /** Runs one panel request and records whatever it answers or rejects with. */
    async call(run: () => Promise<unknown>): Promise<unknown> {
      try {
        const answer = await run()
        answers.push(answer)
        return answer
      } catch (error) {
        answers.push({ rejected: String((error as Error)?.message ?? error) })
        throw error
      }
    },
    assertClean(): void {
      restore()
      const { storage, settings } = host.data()
      const outputs: Record<string, unknown> = {
        answers,
        posts: worker.posts,
        logs: worker.logs,
        terminal,
        storage,
        settings,
        refusals: worker.refusals,
        hostCalls: host.calls.filter((c) => c.method !== 'secrets.set' && c.method !== 'secrets.get')
      }
      for (const [name, value] of Object.entries(outputs)) {
        assert.equal(JSON.stringify(value).includes(token), false, `token leaked into ${name}`)
      }
    },
    restore
  }
}
