import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getUsageLimits } from '../services/usage-limits'
import { getCodexUsageLimits } from '../services/codex-usage'
import { loadSettings } from '../services/settings-persistence'
import { resolveEngine } from '../services/agent-engine'

export function registerUsageIpc(): void {
  ipcMain.handle(IPC.USAGE_LIMITS, async (_event, force?: boolean) => {
    // Same result shape either way — Claude reads the plan's OAuth usage
    // endpoint, Codex reads rate_limits from the newest local rollout file.
    const settings = await loadSettings()
    if (resolveEngine(settings.agentCli) === 'codex') {
      return getCodexUsageLimits(!!force)
    }
    return getUsageLimits(!!force)
  })
}
