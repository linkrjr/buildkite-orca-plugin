// Git remotes: normalize to a comparable `host/owner/repo` key, and read a workspace's `origin`.

/** `host/owner/repo` lowercased, ignoring protocol, user, port and a trailing `.git`; null when
 *  the text is not a git remote. */
export function normalizeRemote(remote: string | null | undefined): string | null {
  const text = (remote ?? '').trim()
  let host: string
  let path: string
  const url = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)\/(.+)$/i.exec(text)
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(text)
  if (url) {
    host = url[1].replace(/^.*@/, '').replace(/:\d*$/, '')
    path = url[2]
  } else if (scp) {
    host = scp[1]
    path = scp[2]
  } else {
    return null
  }
  path = path.replace(/\/+$/, '').replace(/\.git$/i, '').replace(/^\/+/, '')
  if (!host || !path.includes('/')) return null
  return `${host}/${path}`.toLowerCase()
}

/** The remote without its userinfo (user, password or a token used as the user), so a credential
 *  never leaves the worker. */
export function stripCredentials(remote: string | null): string | null {
  if (remote === null) return null
  return remote.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/]*@/i, '$1').replace(/^[^@/\s:]+@(?=[^:/\s]+:(?!\/\/))/, '')
}

type ExecFile = (
  file: string,
  args: string[],
  options: { timeout: number },
  callback: (error: unknown, stdout: string) => void
) => void

/** The `origin` URL of the git checkout at `path`, or null (no path, no origin, no git). */
export async function readGitRemote(path: string): Promise<string | null> {
  if (!path) return null
  try {
    const { execFile } = (await import('node:child_process' as string)) as { execFile: ExecFile }
    return await new Promise<string | null>((resolve) =>
      execFile('git', ['-C', path, 'remote', 'get-url', 'origin'], { timeout: 5000 }, (error, stdout) =>
        resolve(error ? null : String(stdout).trim() || null)
      )
    )
  } catch {
    return null
  }
}
