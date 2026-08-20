import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getUsageLimits } from '../services/usage-limits'

export function registerUsageIpc(): void {
  ipcMain.handle(IPC.USAGE_LIMITS, async (_event, force?: boolean) => {
    return getUsageLimits(!!force)
  })
}
