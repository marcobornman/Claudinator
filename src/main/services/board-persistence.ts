import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { BoardState, createDefaultBoard } from '@shared/models'

function getDataDir(): string {
  return join(app.getPath('appData'), 'claude-orchestrator')
}

function getBoardPath(): string {
  return join(getDataDir(), 'board.json')
}

export async function loadBoard(): Promise<BoardState> {
  const filePath = getBoardPath()
  if (!existsSync(filePath)) {
    return createDefaultBoard()
  }
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as BoardState
  } catch {
    return createDefaultBoard()
  }
}

export async function saveBoard(state: BoardState): Promise<void> {
  const dir = getDataDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  const filePath = getBoardPath()
  const tmpPath = filePath + '.tmp'
  state.lastSaved = Date.now()
  await writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8')
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8')
  // Clean up temp file - best effort
  try {
    const { unlink } = await import('fs/promises')
    await unlink(tmpPath)
  } catch {
    // ignore
  }
}
