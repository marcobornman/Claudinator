import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { readFile, stat, writeFile } from 'fs/promises'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { createInterface } from 'readline'
import { v4 as uuid } from 'uuid'
import { loadBoard } from './board-persistence'
import type { ActiveTimer, TimeEntry, TimeLogResult } from '@shared/time'

// An auto interval stays open while activity pings keep arriving and closes
// after IDLE_MS of quiet. Each ping extends the interval to ping+TAIL_MS, so a
// lone ping still counts as a minute of work instead of a zero-length blip.
const IDLE_MS = 5 * 60_000
const TAIL_MS = 60_000
const SWEEP_MS = 30_000
const SAVE_DEBOUNCE_MS = 5_000

interface OpenInterval {
  title: string
  start: number
  lastPing: number
}

interface LogFile {
  version: 1
  /** Card ids whose transcript history was already imported. */
  backfilledCards: string[]
  entries: TimeEntry[]
}

function logPath(): string {
  return join(app.getPath('appData'), 'claude-orchestrator', 'time-log.json')
}

class TimeTracker {
  private open = new Map<string, OpenInterval>() // auto intervals, keyed by cardId
  private timers = new Map<string, ActiveTimer>() // manual timers, keyed by cardId
  private log: LogFile | null = null
  private loadPromise: Promise<LogFile> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private sweeper: ReturnType<typeof setInterval> | null = null
  private backfillInflight: Promise<number> | null = null

  constructor() {
    app.on('before-quit', () => this.shutdown())
  }

  /** Called on every chunk of PTY traffic for a card's session. Cheap: Map ops only. */
  ping(cardId: string, title: string): void {
    const now = Date.now()
    const cur = this.open.get(cardId)
    if (cur) {
      cur.lastPing = now
      cur.title = title
    } else {
      this.open.set(cardId, { title, start: now, lastPing: now })
    }
    if (!this.sweeper) {
      this.sweeper = setInterval(() => void this.sweep(), SWEEP_MS)
    }
  }

  startTimer(cardId: string, title: string): void {
    if (!this.timers.has(cardId)) {
      this.timers.set(cardId, { cardId, title, start: Date.now() })
    }
  }

  async stopTimer(cardId: string): Promise<void> {
    const t = this.timers.get(cardId)
    if (!t) return
    this.timers.delete(cardId)
    await this.addEntry({
      id: uuid(),
      cardId,
      title: t.title,
      start: t.start,
      end: Date.now(),
      source: 'manual'
    })
  }

  async getLog(fromMs: number, toMs: number): Promise<TimeLogResult> {
    const log = await this.load()
    const now = Date.now()
    const entries = log.entries.filter((e) => e.end > fromMs && e.start < toMs)
    // Surface still-open work as synthetic entries so the view is live.
    for (const [cardId, iv] of this.open) {
      const end = Math.min(now, iv.lastPing + TAIL_MS)
      if (end > fromMs && iv.start < toMs) {
        entries.push({
          id: `open:${cardId}`,
          cardId,
          title: iv.title,
          start: iv.start,
          end,
          source: 'auto',
          running: true
        })
      }
    }
    for (const t of this.timers.values()) {
      if (now > fromMs && t.start < toMs) {
        entries.push({
          id: `timer:${t.cardId}`,
          cardId: t.cardId,
          title: t.title,
          start: t.start,
          end: now,
          source: 'manual',
          running: true
        })
      }
    }
    return { entries, timers: [...this.timers.values()] }
  }

  async updateEntry(id: string, start: number, end: number): Promise<boolean> {
    const log = await this.load()
    const e = log.entries.find((x) => x.id === id)
    if (!e || end <= start) return false
    e.start = start
    e.end = end
    this.scheduleSave()
    return true
  }

  async deleteEntry(id: string): Promise<boolean> {
    const log = await this.load()
    const before = log.entries.length
    log.entries = log.entries.filter((x) => x.id !== id)
    if (log.entries.length === before) return false
    this.scheduleSave()
    return true
  }

  async addManualEntry(
    cardId: string,
    title: string,
    start: number,
    end: number
  ): Promise<TimeEntry | null> {
    if (end <= start) return null
    const entry: TimeEntry = { id: uuid(), cardId, title, start, end, source: 'manual' }
    await this.addEntry(entry)
    return entry
  }

  /**
   * One-time import of history: for every card bound to a conversation,
   * coalesce its transcript's message timestamps into work intervals using the
   * same idle rule as live tracking. Overlaps with live-tracked time are fine —
   * aggregation union-merges per card. Cards without a transcript yet aren't
   * marked done, so they import once the file appears.
   */
  async backfill(): Promise<number> {
    if (this.backfillInflight) return this.backfillInflight
    this.backfillInflight = this.doBackfill().finally(() => {
      this.backfillInflight = null
    })
    return this.backfillInflight
  }

  private async doBackfill(): Promise<number> {
    const log = await this.load()
    const board = await loadBoard()
    let added = 0
    for (const card of Object.values(board.cards)) {
      if (!card.claudeSessionId || log.backfilledCards.includes(card.id)) continue
      const dir = card.worktreePath ?? card.projectDir
      if (!dir) continue
      const projectKey = dir.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+$/, '')
      const file = join(homedir(), '.claude', 'projects', projectKey, card.claudeSessionId + '.jsonl')
      try {
        await stat(file)
      } catch {
        continue // no transcript yet — retry on a later backfill
      }
      const stamps = await collectTimestamps(file)
      for (const iv of coalesce(stamps)) {
        log.entries.push({
          id: uuid(),
          cardId: card.id,
          title: card.title,
          start: iv.start,
          end: iv.end,
          source: 'backfill'
        })
        added++
      }
      log.backfilledCards.push(card.id)
    }
    if (added > 0) log.entries.sort((a, b) => a.start - b.start)
    this.scheduleSave()
    return added
  }

  /** Close idle auto intervals and persist them. */
  private async sweep(): Promise<void> {
    const now = Date.now()
    for (const [cardId, iv] of this.open) {
      if (now - iv.lastPing < IDLE_MS) continue
      this.open.delete(cardId)
      await this.addEntry({
        id: uuid(),
        cardId,
        title: iv.title,
        start: iv.start,
        end: iv.lastPing + TAIL_MS,
        source: 'auto'
      })
    }
  }

  /** Flush everything synchronously — called from before-quit. */
  private shutdown(): void {
    const now = Date.now()
    if (!this.log) {
      // Nothing was ever loaded; only open intervals could need saving, and
      // loading async here isn't possible. Read synchronously via the cache
      // being absent → skip if there is nothing open either.
      if (this.open.size === 0 && this.timers.size === 0) return
      try {
        const raw = existsSync(logPath()) ? readFileSync(logPath(), 'utf-8') : ''
        this.log = raw ? (JSON.parse(raw) as LogFile) : { version: 1, backfilledCards: [], entries: [] }
      } catch {
        this.log = { version: 1, backfilledCards: [], entries: [] }
      }
    }
    for (const [cardId, iv] of this.open) {
      this.log.entries.push({
        id: uuid(),
        cardId,
        title: iv.title,
        start: iv.start,
        end: Math.min(now, iv.lastPing + TAIL_MS),
        source: 'auto'
      })
    }
    this.open.clear()
    for (const t of this.timers.values()) {
      this.log.entries.push({
        id: uuid(),
        cardId: t.cardId,
        title: t.title,
        start: t.start,
        end: now,
        source: 'manual'
      })
    }
    this.timers.clear()
    try {
      mkdirSync(join(app.getPath('appData'), 'claude-orchestrator'), { recursive: true })
      writeFileSync(logPath(), JSON.stringify(this.log, null, 2), 'utf-8')
    } catch {
      // best effort on quit
    }
  }

  private async load(): Promise<LogFile> {
    if (this.log) return this.log
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        try {
          const raw = await readFile(logPath(), 'utf-8')
          this.log = JSON.parse(raw) as LogFile
        } catch {
          this.log = { version: 1, backfilledCards: [], entries: [] }
        }
        return this.log
      })()
    }
    return this.loadPromise
  }

  private async addEntry(entry: TimeEntry): Promise<void> {
    const log = await this.load()
    log.entries.push(entry)
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.save()
    }, SAVE_DEBOUNCE_MS)
  }

  private async save(): Promise<void> {
    if (!this.log) return
    try {
      mkdirSync(join(app.getPath('appData'), 'claude-orchestrator'), { recursive: true })
      await writeFile(logPath(), JSON.stringify(this.log, null, 2), 'utf-8')
    } catch {
      // retry on next change
    }
  }
}

/** All message timestamps (ms) in a transcript, in file order. */
function collectTimestamps(file: string): Promise<number[]> {
  return new Promise((resolve) => {
    const out: number[] = []
    const stream = createReadStream(file, { encoding: 'utf-8' })
    stream.on('error', () => resolve(out))
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    rl.on('line', (line) => {
      const m = line.match(/"timestamp"\s*:\s*"([^"]+)"/)
      if (m) {
        const ms = Date.parse(m[1])
        if (!Number.isNaN(ms)) out.push(ms)
      }
    })
    rl.on('close', () => resolve(out))
    rl.on('error', () => resolve(out))
  })
}

/** Coalesce timestamps into intervals using the live-tracking idle rule. */
function coalesce(stamps: number[]): { start: number; end: number }[] {
  const sorted = [...stamps].sort((a, b) => a - b)
  const out: { start: number; end: number }[] = []
  let start = 0
  let last = 0
  for (const ts of sorted) {
    if (start === 0) {
      start = ts
      last = ts
    } else if (ts - last > IDLE_MS) {
      out.push({ start, end: last + TAIL_MS })
      start = ts
      last = ts
    } else {
      last = ts
    }
  }
  if (start !== 0) out.push({ start, end: last + TAIL_MS })
  return out
}

export const timeTracker = new TimeTracker()
