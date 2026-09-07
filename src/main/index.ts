import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import { join, isAbsolute, resolve } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { registerAllIpc } from './ipc/register-all'
import { startRemoteIfEnabled } from './ipc/remote-ipc'
import { showFileInPreview } from './ipc/preview-ipc'
import { sessionManager } from './services/session-manager'
import { remoteServer } from './services/remote-server'
import { loadSettings } from './services/settings-persistence'
import { IPC } from '@shared/ipc-channels'

const THEME_TITLEBAR = {
  dark: { color: '#0c0c0c', symbolColor: '#9d9d9d' },
  light: { color: '#ffffff', symbolColor: '#59636e' }
} as const

// Dimmed caption-button colors used while a full-screen modal is open. The OS
// draws the title-bar overlay on top of everything, so the React backdrop can't
// cover it — instead we darken the overlay to match the dimmed window. Values are
// --bg-overlay composited over --bg-primary (dark: 0.6 over #0c0c0c, light: 0.3 over #fff).
const THEME_TITLEBAR_DIM = {
  dark: { color: '#050505', symbolColor: '#9d9d9d' },
  light: { color: '#b3b3b3', symbolColor: '#59636e' }
} as const

let currentTheme: 'dark' | 'light' = 'dark'
let dimDepth = 0
let mainWindow: BrowserWindow | null = null
let remoteStarted = false

function refreshTitleBar(win: BrowserWindow): void {
  const palette = dimDepth > 0 ? THEME_TITLEBAR_DIM : THEME_TITLEBAR
  const colors = palette[currentTheme] ?? palette.dark
  win.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor, height: 36 })
}

// The board's title-bar handlers live outside createWindow so re-creating the
// board (second-instance while only the preview is open) can't double-register.
function registerTitleBarIpc(): void {
  ipcMain.handle(IPC.THEME_CHANGE, (_event, theme: 'dark' | 'light') => {
    currentTheme = theme
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor((THEME_TITLEBAR[theme] ?? THEME_TITLEBAR.dark).color)
      refreshTitleBar(mainWindow)
    }
  })

  // Dim/restore the caption-button overlay while modals are open (ref-counted so
  // stacked modals don't restore early).
  ipcMain.handle(IPC.TITLEBAR_DIM, (_event, dimmed: boolean) => {
    dimDepth = Math.max(0, dimDepth + (dimmed ? 1 : -1))
    if (mainWindow && !mainWindow.isDestroyed()) refreshTitleBar(mainWindow)
  })
}

function ensureRemote(): void {
  if (remoteStarted) return
  remoteStarted = true
  startRemoteIfEnabled()
}

// First .md/.markdown path in the launch args — how Windows hands us a file
// opened via "Open with". Only consulted in packaged builds (dev argv carries
// electron's own paths).
function mdPathFromArgv(argv: string[], cwd: string): string | null {
  for (const raw of argv.slice(1)) {
    if (raw.startsWith('-')) continue
    if (!/\.(md|markdown)$/i.test(raw)) continue
    const path = isAbsolute(raw) ? raw : resolve(cwd, raw)
    if (existsSync(path)) return path
  }
  return null
}

async function createWindow(): Promise<void> {
  const settings = await loadSettings()
  currentTheme = settings.theme === 'light' ? 'light' : 'dark'
  const tb = THEME_TITLEBAR[currentTheme] ?? THEME_TITLEBAR.dark

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: true,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: tb.color,
      symbolColor: tb.symbolColor,
      height: 36
    },
    title: 'Claude Code Orchestrator',
    backgroundColor: tb.color,
    // Packaged builds get the icon embedded in the exe; in dev point the window
    // at the source icon so the taskbar/window show the real branding too.
    ...(is.dev ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Stop the taskbar-flash nudge as soon as the user comes back to the app.
  win.on('focus', () => {
    win.flashFrame(false)
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Windows ties toast notifications to an App User Model ID; without this,
// notifications are attributed to "electron.app.Electron" (or dropped). Must
// match the electron-builder appId so packaged shortcuts resolve to it.
app.setAppUserModelId('com.claude-orchestrator.app')

// Launched with a markdown file (Windows "Open with")? Skip the board and open
// just the preview window. Packaged builds only — and the single-instance lock
// is packaged-only too, since dev and installed share a userData dir and the
// lock would otherwise stop `npm run dev` while the installed app is running.
const fileToPreview = app.isPackaged ? mdPathFromArgv(process.argv, process.cwd()) : null
let quitting = false

if (app.isPackaged) {
  if (!app.requestSingleInstanceLock()) {
    // Hand our argv to the running instance and bow out.
    quitting = true
    app.quit()
  } else {
    app.on('second-instance', (_event, argv, workingDirectory) => {
      const md = mdPathFromArgv(argv, workingDirectory)
      if (md) {
        void showFileInPreview(md)
        return
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      } else {
        // Only the preview is open (viewer-mode launch) and the user started
        // the app proper — bring up the board.
        void createWindow().then(ensureRemote)
      }
    })
  }
}

app.whenReady().then(async () => {
  if (quitting) return
  Menu.setApplicationMenu(null)
  registerAllIpc()
  registerTitleBarIpc()
  if (fileToPreview) {
    await showFileInPreview(fileToPreview)
    return
  }
  await createWindow()
  ensureRemote()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  sessionManager.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  sessionManager.killAll()
  remoteServer.stop()
})
