// Time tracking: work intervals per card, auto-derived from terminal activity
// or recorded with manual timers. Aggregation always union-merges overlapping
// intervals per card, so auto + manual + backfilled entries never double-count.

export type TimeSource = 'auto' | 'manual' | 'backfill'

export interface TimeEntry {
  id: string
  cardId: string
  title: string
  start: number // ms epoch
  end: number // ms epoch
  source: TimeSource
  /** Synthetic, not persisted yet: a still-open interval (active work / running timer). */
  running?: boolean
}

export interface ActiveTimer {
  cardId: string
  title: string
  start: number
}

export interface TimeLogResult {
  entries: TimeEntry[]
  timers: ActiveTimer[]
}

/**
 * Jira key from a card title. Titles here are written loosely ("Apps 1906 -
 * Jobdispatcher sending emojis" or "APPS-1906 fix"), so accept `KEY-123`,
 * `KEY 123` and `Key123` at the start and normalize to `KEY-123` — the form
 * the business sees in Jira.
 */
export function extractJiraKey(title: string): string | null {
  const m = title.match(/^\s*([A-Za-z][A-Za-z0-9]{1,9}?)[-\s]*(\d{1,6})\b/)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null
}

/**
 * Estimation: tracked entries only cover terminal activity, but between two
 * touches of the same card you're usually still working that item (coding,
 * reading, testing). Bridging gaps up to this size approximates that; bigger
 * gaps (lunch, overnight, context switch) stay excluded.
 */
export const ESTIMATE_GAP_MS = 60 * 60_000

/** Merge one card's intervals, filling gaps of up to gapMs between them. */
export function bridgeEntries(
  entries: { start: number; end: number }[],
  gapMs: number
): { start: number; end: number }[] {
  const sorted = [...entries].sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  for (const e of sorted) {
    const last = out[out.length - 1]
    if (last && e.start - last.end <= gapMs) {
      if (e.end > last.end) last.end = e.end
    } else {
      out.push({ start: e.start, end: e.end })
    }
  }
  return out
}

/**
 * Total minutes covered by a set of intervals inside [from, to), counting
 * overlapping spans once (union length, not sum).
 */
export function mergedMinutes(
  entries: { start: number; end: number }[],
  from: number,
  to: number
): number {
  const spans = entries
    .map((e) => ({ s: Math.max(e.start, from), e: Math.min(e.end, to) }))
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s)
  let total = 0
  let curS = 0
  let curE = 0
  for (const sp of spans) {
    if (sp.s > curE) {
      total += curE - curS
      curS = sp.s
      curE = sp.e
    } else if (sp.e > curE) {
      curE = sp.e
    }
  }
  total += curE - curS
  return total / 60_000
}
