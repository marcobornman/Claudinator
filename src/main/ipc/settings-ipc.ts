import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { IPC } from '@shared/ipc-channels'
import { loadSettings, saveSettings, Settings } from '../services/settings-persistence'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_LOAD, async () => {
    return await loadSettings()
  })

  ipcMain.handle(IPC.SETTINGS_SAVE, async (_event, settings: Settings) => {
    await saveSettings(settings)
  })

  ipcMain.handle(IPC.SETTINGS_ADD_RULE, async (_event, rule: string) => {
    const settings = await loadSettings()
    if (!settings.rules.includes(rule)) {
      settings.rules.push(rule)
      await saveSettings(settings)
    }
    return settings.rules
  })

  ipcMain.handle(IPC.THEME_IMPORT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import Theme',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const raw = await readFile(result.filePaths[0], 'utf-8')
      const parsed = JSON.parse(raw)
      // Validate basic structure
      if (typeof parsed !== 'object' || parsed === null) return null
      return parsed
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.OPEN_FILE, async (_event, filePath: string) => {
    return await shell.openPath(filePath)
  })

  ipcMain.handle(IPC.THEME_EXPORT, async (event, themeJson: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Theme',
      defaultPath: 'theme.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    try {
      await writeFile(result.filePath, themeJson, 'utf-8')
      return true
    } catch {
      return false
    }
  })
}
