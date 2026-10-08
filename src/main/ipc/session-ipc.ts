import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { modelFitsEngine } from '@shared/model-presets'
import { sessionManager } from '../services/session-manager'
import { loadSettings } from '../services/settings-persistence'
import { resolveEngine } from '../services/agent-engine'

// How often idle sessions are checked for hibernation.
const HIBERNATE_SWEEP_MS = 10 * 60 * 1000

export function registerSessionIpc(): void {
  // Tell every window when a session is hibernated, so the renderer drops
  // its terminal (the card stays resumable via its conversation id).
  sessionManager.onHibernate((sessionId, cardId) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.SESSION_HIBERNATED, sessionId, cardId)
    }
  })
  setInterval(async () => {
    try {
      const { hibernateAfterHours } = await loadSettings()
      if (hibernateAfterHours > 0) sessionManager.hibernateIdle(hibernateAfterHours * 3600_000)
    } catch {
      // try again next sweep
    }
  }, HIBERNATE_SWEEP_MS)

  ipcMain.handle(
    IPC.SESSION_START,
    async (
      event,
      args: {
        cardId: string
        cardTitle: string
        projectDir: string
        claudeSessionId?: string | null
        model?: string | null
      }
    ) => {
      const settings = await loadSettings()
      const engine = resolveEngine(settings.agentCli)
      // A per-card override written under the other engine (before the Agent
      // setting changed) is ignored rather than passed to the wrong CLI.
      const override = args.model?.trim() ?? ''
      const model =
        (modelFitsEngine(override, engine) ? override : '') ||
        (engine === 'codex' ? settings.codexModel : settings.claudeModel)
      const info = await sessionManager.start(
        args.cardId,
        args.cardTitle,
        args.projectDir,
        args.claudeSessionId,
        settings.rules,
        settings.pats,
        model,
        engine
      )

      const win = BrowserWindow.fromWebContents(event.sender)

      // Forward PTY data to renderer
      sessionManager.onData(info.id, (data) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.SESSION_DATA, info.id, data)
        }
      })

      // Forward PTY exit to renderer
      sessionManager.onExit(info.id, (code) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.SESSION_EXIT, info.id, code)
        }
      })

      // Forward detected Claude conversation ID to renderer
      sessionManager.onClaudeId(info.id, (conversationId) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.SESSION_CLAUDE_ID, info.id, conversationId)
        }
      })

      // Forward attention-status changes (running / waiting / decision / stopped)
      sessionManager.onStatus(info.id, (status) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.SESSION_STATUS, info.id, status)
        }
      })

      return info
    }
  )

  ipcMain.handle(IPC.SESSION_STOP, async (_event, sessionId: string) => {
    return sessionManager.stop(sessionId)
  })

  ipcMain.handle(IPC.SESSION_WRITE, async (_event, sessionId: string, data: string) => {
    sessionManager.write(sessionId, data)
  })

  ipcMain.handle(IPC.SESSION_RESIZE, async (_event, sessionId: string, cols: number, rows: number) => {
    sessionManager.resize(sessionId, cols, rows)
  })

  ipcMain.handle(IPC.SESSION_BUFFER, async (_event, sessionId: string) => {
    return sessionManager.getBuffer(sessionId)
  })

  ipcMain.handle(IPC.SESSION_LIST, async () => {
    return sessionManager.listSessions()
  })

  ipcMain.handle(IPC.SESSION_CWD, async (_event, sessionId: string) => {
    return sessionManager.getCwd(sessionId)
  })

  ipcMain.handle(IPC.SESSION_CONTEXT, async (_event, sessionId: string) => {
    return sessionManager.getContextInfo(sessionId)
  })

  ipcMain.handle(
    IPC.SESSION_SET_CLAUDE_ID,
    async (_event, sessionId: string, claudeId: string | null) => {
      sessionManager.setClaudeSessionId(sessionId, claudeId)
    }
  )
}
