import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { IPC } from '@shared/ipc-channels'
import { loadSettings } from '../services/settings-persistence'
import { resolveEngine } from '../services/agent-engine'

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

// Run the agent binary through a shell so PATH resolution finds the
// platform shim (e.g. claude.cmd on Windows). exec() uses a shell by default.
async function runCli(
  bin: 'claude' | 'codex',
  argsLine: string,
  timeout: number,
  stripProxy = false
): Promise<{ stdout: string; stderr: string }> {
  return await execAsync(`${bin} ${argsLine}`, {
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

// Run `<cli> update`, and if it fails in a way that looks like the registry
// was unreachable, retry once with proxy vars stripped from the child env.
async function runCliUpdate(
  bin: 'claude' | 'codex',
  timeout: number
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await runCli(bin, 'update', timeout)
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string }
    const combined = `${e.message}\n${e.stdout ?? ''}\n${e.stderr ?? ''}`
    if (!looksLikeRegistryUnreachable(combined)) throw err
    // Fallback: a stale/dead proxy in the inherited env is the likely culprit —
    // retry without proxy vars so the child talks to the registry directly.
    return await runCli(bin, 'update', timeout, true)
  }
}

async function currentEngine(): Promise<'claude' | 'codex'> {
  return resolveEngine((await loadSettings()).agentCli)
}

export function registerCliIpc(): void {
  ipcMain.handle(IPC.CLI_VERSION, async (): Promise<CliVersion> => {
    try {
      const { stdout } = await runCli(await currentEngine(), '--version', 30_000)
      const match = stdout.match(/(\d+\.\d+\.\d+)/)
      return { version: match ? match[1] : stdout.trim() }
    } catch (err) {
      return { version: null, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.CLI_UPDATE, async (): Promise<CliUpdateResult> => {
    const engine = await currentEngine()
    if (engine === 'codex') {
      // `codex update` runs npm install -g under the hood; judge loosely from
      // output — the claude-specific lock/error parsing below doesn't apply.
      try {
        const { stdout, stderr } = await runCliUpdate('codex', 180_000)
        const output = `${stdout}\n${stderr}`.trim()
        const versions = output.match(/(\d+\.\d+\.\d+)\s*(?:->|to)\s*v?(\d+\.\d+\.\d+)/i)
        const alreadyLatest = /already|up[- ]?to[- ]?date|latest/i.test(output) && !versions
        return { ok: true, from: versions?.[1], to: versions?.[2], alreadyLatest, output }
      } catch (err) {
        return { ok: false, alreadyLatest: false, output: '', error: (err as Error).message }
      }
    }
    try {
      // `claude update` can download + install, so allow a generous timeout.
      const { stdout, stderr } = await runCliUpdate('claude', 180_000)
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
