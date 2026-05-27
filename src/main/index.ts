import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerAllIpc } from './ipc/register-all'
import { sessionManager } from './services/session-manager'
import { loadSettings } from './services/settings-persistence'
import { IPC } from '@shared/ipc-channels'

const THEME_TITLEBAR = {
  dark: { color: '#0d1117', symbolColor: '#9198a1' },
  light: { color: '#ffffff', symbolColor: '#59636e' }
} as const

async function createWindow(): Promise<void> {
  const settings = await loadSettings()
  const tb = THEME_TITLEBAR[settings.theme] ?? THEME_TITLEBAR.dark

  const mainWindow = new BrowserWindow({
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Update titlebar when theme changes at runtime
  ipcMain.handle(IPC.THEME_CHANGE, (_event, theme: 'dark' | 'light') => {
    const colors = THEME_TITLEBAR[theme] ?? THEME_TITLEBAR.dark
    mainWindow.setBackgroundColor(colors.color)
    mainWindow.setTitleBarOverlay({
      color: colors.color,
      symbolColor: colors.symbolColor,
      height: 36
    })
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  registerAllIpc()
  await createWindow()

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
})
