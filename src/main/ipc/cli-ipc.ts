import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { IPC } from '@shared/ipc-channels'

const execAsync = promisify(exec)

export interface CliVersion {
  version: string | null
  error?: string
}

export interface CliUpdateResult {
  ok: boolean
  from?: string
  to?: string
  alreadyLatest: boolean
  output: string
  error?: string
}

// When the app is launched via `npm run dev`, npm injects npm_config_* env
// vars (registry, proxy, cache, userconfig…) into the process. Those would be
// inherited by the `claude update` child and make its internal `npm` call use
// dev config — e.g. "registry unreachable". Strip them (plus NODE_OPTIONS) so
// the child reads the user's real npm setup. No-op in the installed app.
//
// When `stripProxy` is set we also drop the proxy vars. A GUI app snapshots its
// environment at launch, so a stale/dead proxy captured from the shell it was
// started from can poison the child's registry request even though the CLI and
// network are fine from a fresh terminal. We only strip these on a fallback
// retry (see runClaudeUpdate) so genuinely-proxied users are unaffected.
const PROXY_VARS = new Set([
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'ftp_proxy'
])

function cleanEnv(stripProxy = false): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    const lower = key.toLowerCase()
    if (lower.startsWith('npm_config_')) continue
    if (lower.startsWith('npm_package_')) continue
    if (key === 'NODE_OPTIONS' || key === 'NODE_ENV') continue
    if (stripProxy && PROXY_VARS.has(lower)) continue
    env[key] = value
  }
  return env
}

// Run the `claude` binary through a shell so PATH resolution finds the
// platform shim (e.g. claude.cmd on Windows). exec() uses a shell by default.
async function runClaude(
  argsLine: string,
  timeout: number,
  stripProxy = false
): Promise<{ stdout: string; stderr: string }> {
  return await execAsync(`claude ${argsLine}`, {
    timeout,
    windowsHide: true,
    env: cleanEnv(stripProxy)
  })
}

// True for the class of `claude update` failures caused by the child not
// reaching the npm registry — the case a stale/bad proxy in the app's inherited
// environment produces. Matches the CLI's own wording plus common network codes.
function looksLikeRegistryUnreachable(text: string): boolean {
  return /registry|proxy|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|fetch/i.test(
    text
  )
}

// Run `claude update`, and if it fails in a way that looks like the registry
// was unreachable, retry once with proxy vars stripped from the child env.
async function runClaudeUpdate(timeout: number): Promise<{ stdout: string; stderr: string }> {
  try {
    return await runClaude('update', timeout)
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string }
    const combined = `${e.message}\n${e.stdout ?? ''}\n${e.stderr ?? ''}`
    if (!looksLikeRegistryUnreachable(combined)) throw err
    // Fallback: a stale/dead proxy in the inherited env is the likely culprit —
    // retry without proxy vars so the child talks to the registry directly.
    return await runClaude('update', timeout, true)
  }
}

export function registerCliIpc(): void {
  ipcMain.handle(IPC.CLI_VERSION, async (): Promise<CliVersion> => {
    try {
      const { stdout } = await runClaude('--version', 30_000)
      const match = stdout.match(/(\d+\.\d+\.\d+)/)
      return { version: match ? match[1] : stdout.trim() }
    } catch (err) {
      return { version: null, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.CLI_UPDATE, async (): Promise<CliUpdateResult> => {
    try {
      // `claude update` can download + install, so allow a generous timeout.
      const { stdout, stderr } = await runClaudeUpdate(180_000)
      const output = `${stdout}\n${stderr}`.trim()
      const updated = output.match(/updated from (\d+\.\d+\.\d+) to (?:version )?(\d+\.\d+\.\d+)/i)
      // `claude update` exits 0 even when the install step fails (e.g. the
      // running claude.exe can't be replaced on Windows), so success has to be
      // judged from the output, not the exit code.
      if (!updated && /update failed|error:/i.test(output)) {
        const available = output.match(/new version available: (\d+\.\d+\.\d+)/i)?.[1]
        const inUse = /is in use/i.test(output)
        return {
          ok: false,
          alreadyLatest: false,
          output,
          error: inUse
            ? `claude.exe is locked by a running Claude session${available ? ` (v${available} is available)` : ''}. Stop every running session in this app — each running card holds a lock — close any terminals or VS Code windows running Claude, then try again.`
            : output.match(/error:\s*(.+)/i)?.[1] ?? 'Update failed'
        }
      }
      const alreadyLatest = !updated && /already .*(latest|up[- ]?to[- ]?date)|no update|up[- ]?to[- ]?date/i.test(output)
      return {
        ok: true,
        from: updated?.[1],
        to: updated?.[2],
        alreadyLatest,
        output
      }
    } catch (err) {
      return { ok: false, alreadyLatest: false, output: '', error: (err as Error).message }
    }
  })
}
