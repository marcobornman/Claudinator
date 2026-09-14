import { execFileSync } from 'child_process'
import type { AgentEngine } from '@shared/model-presets'

export interface EngineInfo {
  engine: AgentEngine
  claudeFound: boolean
  codexFound: boolean
}

let detected: { claude: boolean; codex: boolean } | null = null

/** Which agent CLIs are on PATH. Detected once per app run. */
export function detectInstalledClis(): { claude: boolean; codex: boolean } {
  if (detected) return detected
  const has = (cmd: string): boolean => {
    try {
      execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [cmd], {
        stdio: 'pipe',
        windowsHide: true,
        timeout: 5000
      })
      return true
    } catch {
      return false
    }
  }
  detected = { claude: has('claude'), codex: has('codex') }
  return detected
}

/** Resolve the agentCli setting ('' = auto) to a concrete engine. Auto picks
 *  claude unless only codex is installed — so a Codex-only laptop works with
 *  zero configuration while existing installs stay on Claude. */
export function resolveEngine(setting: string): AgentEngine {
  if (setting === 'claude' || setting === 'codex') return setting
  const d = detectInstalledClis()
  if (!d.claude && d.codex) return 'codex'
  return 'claude'
}

export function getEngineInfo(setting: string): EngineInfo {
  const d = detectInstalledClis()
  return { engine: resolveEngine(setting), claudeFound: d.claude, codexFound: d.codex }
}
