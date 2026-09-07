import { ipcMain, BrowserWindow, shell } from 'electron'
import { join, basename } from 'path'
import { readFile } from 'fs/promises'
import { is } from '@electron-toolkit/utils'
import { marked } from 'marked'
import { IPC } from '@shared/ipc-channels'
import { loadSettings } from '../services/settings-persistence'

interface PreviewData {
  html: string
  theme: 'dark' | 'light'
  title: string
}

let previewWindow: BrowserWindow | null = null
// Cache the latest payload so a freshly-opened window can render immediately,
// before the editor sends its next update.
let lastData: PreviewData | null = null
// Set when the preview shows a file opened from Windows (Open with) rather
// than a note streamed by the editor — refresh then re-reads this file.
let fileSource: string | null = null

function broadcastClosed(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.PREVIEW_CLOSED)
  }
}

function openPreviewWindow(): void {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.focus()
    return
  }

  const bg = lastData?.theme === 'light' ? '#ffffff' : '#0c0c0c'
  previewWindow = new BrowserWindow({
    width: 620,
    height: 820,
    title: 'Markdown Preview',
    backgroundColor: bg,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  previewWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  previewWindow.on('closed', () => {
    previewWindow = null
    broadcastClosed()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    previewWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#preview`)
  } else {
    previewWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'preview' })
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Open (or update) the preview window with a markdown file from disk. */
export async function showFileInPreview(filePath: string): Promise<void> {
  let html: string
  try {
    const md = await readFile(filePath, 'utf-8')
    try {
      html = marked.parse(md, { gfm: true, breaks: true, async: false }) as string
    } catch {
      html = `<pre>${escapeHtml(md)}</pre>`
    }
  } catch {
    html = `<p>Could not read <code>${escapeHtml(filePath)}</code></p>`
  }
  const settings = await loadSettings()
  lastData = {
    html,
    theme: settings.theme === 'light' ? 'light' : 'dark',
    title: basename(filePath)
  }
  fileSource = filePath

  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.send(IPC.PREVIEW_DATA, lastData)
    previewWindow.focus()
  } else {
    openPreviewWindow()
  }
}

export function registerPreviewIpc(): void {
  ipcMain.handle(IPC.PREVIEW_OPEN, () => {
    openPreviewWindow()
  })

  // Editor window streams content/theme updates; relay to the preview window.
  ipcMain.on(IPC.PREVIEW_UPDATE, (_event, data: PreviewData) => {
    lastData = data
    fileSource = null // the editor owns the preview again
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.webContents.send(IPC.PREVIEW_DATA, data)
    }
  })

  // The preview renderer asks for the current payload once its listener is
  // attached — avoids a race where the first push is dropped before mount.
  ipcMain.on(IPC.PREVIEW_READY, (event) => {
    if (lastData) event.sender.send(IPC.PREVIEW_DATA, lastData)
  })

  ipcMain.handle(IPC.PREVIEW_CLOSE, () => {
    if (previewWindow && !previewWindow.isDestroyed()) previewWindow.close()
  })

  // Popout's refresh button → tell the editor window(s) to reload the note from
  // disk and re-stream it. Skip the preview window itself. File-backed previews
  // have no editor — re-read the file instead.
  ipcMain.on(IPC.PREVIEW_REFRESH, () => {
    if (fileSource) {
      void showFileInPreview(fileSource)
      return
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (previewWindow && win.id === previewWindow.id) continue
      win.webContents.send(IPC.PREVIEW_REFRESH)
    }
  })
}
