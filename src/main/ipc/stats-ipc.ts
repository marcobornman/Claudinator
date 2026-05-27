import { ipcMain } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { IPC } from '@shared/ipc-channels'

interface TodayStats {
  date: string
  tokens: number
  messages: number
  sessions: number
  toolCalls: number
}

export function registerStatsIpc(): void {
  ipcMain.handle(IPC.STATS_TODAY, async (): Promise<TodayStats> => {
    const statsPath = join(homedir(), '.claude', 'stats-cache.json')
    try {
      const raw = await readFile(statsPath, 'utf-8')
      const data = JSON.parse(raw)

      const today = new Date().toISOString().slice(0, 10)

      // Try today first, then fall back to most recent day
      let activity = data.dailyActivity?.find(
        (d: { date: string }) => d.date === today
      )
      let tokenEntry = data.dailyModelTokens?.find(
        (d: { date: string }) => d.date === today
      )

      let date = today

      if (!activity && data.dailyActivity?.length > 0) {
        activity = data.dailyActivity[data.dailyActivity.length - 1]
        date = activity.date
      }
      if (!tokenEntry && data.dailyModelTokens?.length > 0) {
        tokenEntry = data.dailyModelTokens[data.dailyModelTokens.length - 1]
      }

      let tokens = 0
      if (tokenEntry?.tokensByModel) {
        for (const count of Object.values(tokenEntry.tokensByModel)) {
          tokens += count as number
        }
      }

      return {
        date,
        tokens,
        messages: activity?.messageCount ?? 0,
        sessions: activity?.sessionCount ?? 0,
        toolCalls: activity?.toolCallCount ?? 0
      }
    } catch {
      return { date: '', tokens: 0, messages: 0, sessions: 0, toolCalls: 0 }
    }
  })
}
