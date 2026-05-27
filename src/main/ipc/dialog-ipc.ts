import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'

export function registerDialogIpc(): void {
  ipcMain.handle(IPC.DIALOG_PICK_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
