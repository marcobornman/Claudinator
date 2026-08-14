import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { timeTracker } from '../services/time-tracker'
import type { TimeEntry, TimeLogResult } from '@shared/time'

export function registerTimeIpc(): void {
  ipcMain.handle(
    IPC.TIME_LOG,
    (_e, fromMs: number, toMs: number): Promise<TimeLogResult> => timeTracker.getLog(fromMs, toMs)
  )

  ipcMain.handle(IPC.TIME_TIMER_START, (_e, cardId: string, title: string): void => {
    timeTracker.startTimer(cardId, title)
  })

  ipcMain.handle(
    IPC.TIME_TIMER_STOP,
    (_e, cardId: string): Promise<void> => timeTracker.stopTimer(cardId)
  )

  ipcMain.handle(
    IPC.TIME_ENTRY_ADD,
    (
      _e,
      cardId: string,
      title: string,
      start: number,
      end: number
    ): Promise<TimeEntry | null> => timeTracker.addManualEntry(cardId, title, start, end)
  )

  ipcMain.handle(
    IPC.TIME_ENTRY_UPDATE,
    (_e, id: string, start: number, end: number): Promise<boolean> =>
      timeTracker.updateEntry(id, start, end)
  )

  ipcMain.handle(
    IPC.TIME_ENTRY_DELETE,
    (_e, id: string): Promise<boolean> => timeTracker.deleteEntry(id)
  )

  ipcMain.handle(IPC.TIME_BACKFILL, (): Promise<number> => timeTracker.backfill())
}
