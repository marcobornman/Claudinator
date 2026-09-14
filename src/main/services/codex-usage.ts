// Codex plan usage — read from the newest rollout's rate_limits events
// (~/.codex/sessions/...), which every token_count carries: primary is the
// 5-hour session window, secondary the 7-day window, with used_percent and
// reset epochs. Purely local file reads, no network, nothing modified.

import { open, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { UsageLimit, UsageLimitsResult } from '@shared/usage'

const CACHE_MS = 60_000
let cached: UsageLimitsResult | null = null
let cachedAt = 0

function windowLabel(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return ''
  if (minutes % 1440 === 0) return `${minutes / 1440}-day window`
  if (minutes % 60 === 0) return `${minutes / 60}-hour window`
  return `${minutes}-minute window`
}

interface RawWindow {
  used_percent?: number
  window_minutes?: number
  resets_at?: number
}

function toLimit(kind: string, label: string, w: RawWindow | null | undefined): UsageLimit | null {
  if (!w || typeof w.used_percent !== 'number') return null
  const percent = Math.max(0, Math.min(100, Math.round(w.used_percent)))
  return {
    kind,
    group: kind === 'session' ? 'session' : 'weekly',
    label,
    subLabel: windowLabel(w.window_minutes),
    percent,
    severity: 'normal',
    resetsAt: w.resets_at ? new Date(w.resets_at * 1000).toISOString() : null
  }
}

/** Newest rollout file across the last ~14 day folders (newest mtime wins). */
async function findNewestRollout(): Promise<{ path: string; mtimeMs: number } | null> {
  const root = join(homedir(), '.codex', 'sessions')
  let best: { path: string; mtimeMs: number } | null = null
  try {
    const dayDirs: string[] = []
    for (const y of (await readdir(root)).sort().reverse().slice(0, 2)) {
      for (const m of (await readdir(join(root, y))).sort().reverse().slice(0, 2)) {
        for (const d of (await readdir(join(root, y, m))).sort().reverse()) {
          dayDirs.push(join(root, y, m, d))
          if (dayDirs.length >= 14) break
        }
        if (dayDirs.length >= 14) break
      }
      if (dayDirs.length >= 14) break
    }
    for (const dir of dayDirs) {
      try {
        for (const f of await readdir(dir)) {
          if (!f.endsWith('.jsonl')) continue
          const p = join(dir, f)
          const s = await stat(p)
          if (!best || s.mtimeMs > best.mtimeMs) best = { path: p, mtimeMs: s.mtimeMs }
        }
      } catch {
        continue
      }
      if (best) break // day dirs are visited newest-first; first hit day wins
    }
  } catch {
    return null
  }
  return best
}

export async function getCodexUsageLimits(force = false): Promise<UsageLimitsResult> {
  const now = Date.now()
  if (!force && cached && now - cachedAt < CACHE_MS) return cached

  const empty: UsageLimitsResult = { limits: [], updatedAt: 0 }
  const rollout = await findNewestRollout()
  if (!rollout) {
    return { ...empty, error: 'No Codex sessions yet — usage appears after the first conversation.' }
  }

  try {
    const fh = await open(rollout.path, 'r')
    let tail: string
    try {
      const { size } = await fh.stat()
      const readLen = Math.min(size, 256 * 1024)
      const buf = Buffer.alloc(readLen)
      await fh.read(buf, 0, readLen, size - readLen)
      tail = buf.toString('utf-8')
    } finally {
      await fh.close()
    }

    // Parse the last complete line containing rate_limits — regex-balancing
    // nested JSON is fragile, whole-line JSON.parse is not.
    const line = tail
      .split('\n')
      .reverse()
      .find((l) => l.includes('"rate_limits"'))
    if (!line) {
      return { ...empty, error: 'No usage data in the latest Codex session yet.' }
    }
    let rl: { primary?: RawWindow; secondary?: RawWindow; plan_type?: string } | null = null
    try {
      const parsed = JSON.parse(line)
      // token_count events nest it at payload.rate_limits (observed shape);
      // fall back to nearby spots.
      rl =
        parsed?.payload?.rate_limits ??
        parsed?.rate_limits ??
        parsed?.payload?.info?.rate_limits ??
        null
    } catch {
      rl = null
    }
    if (!rl) {
      return { ...empty, error: 'Could not read usage from the latest Codex session.' }
    }

    const limits = [
      toLimit('session', 'Session', rl.primary),
      toLimit('weekly_all', 'Weekly', rl.secondary)
    ].filter((l): l is UsageLimit => l !== null)

    cached = { limits, updatedAt: rollout.mtimeMs }
    cachedAt = now
    return cached
  } catch {
    return { ...empty, error: 'Could not read the latest Codex session file.' }
  }
}
