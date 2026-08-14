import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBoardStore } from '@/stores/board-store'
import { extractJiraKey, mergedMinutes, bridgeEntries, ESTIMATE_GAP_MS } from '@shared/time'
import type { TimeEntry, ActiveTimer } from '@shared/time'

const DAY_MS = 86_400_000

// Monday 00:00 (local) of the week containing `ms`.
function startOfWeek(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // Mon=0..Sun=6
  return d.getTime() - dow * DAY_MS
}

function fmtHM(minutes: number): string {
  const m = Math.round(minutes)
  const h = Math.floor(m / 60)
  return `${h}:${String(m % 60).padStart(2, '0')}`
}

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function localDayKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA')
}

// datetime-local input value <-> ms epoch (local time)
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(v: string): number {
  return new Date(v).getTime()
}

interface Group {
  key: string
  jiraKey: string | null
  title: string
  entries: TimeEntry[]
  perDay: number[] // minutes, Mon..Sun
  estPerDay: number[] // estimated minutes (gaps bridged), Mon..Sun
  total: number
  estTotal: number
  running: boolean
}

// Bridge each card's entries separately, then treat the result as one set —
// parallel cards on the same item still count once when union-merged later.
function estimateSpans(entries: TimeEntry[]): { start: number; end: number }[] {
  const byCard = new Map<string, TimeEntry[]>()
  for (const e of entries) {
    const list = byCard.get(e.cardId)
    if (list) list.push(e)
    else byCard.set(e.cardId, [e])
  }
  const spans: { start: number; end: number }[] = []
  for (const list of byCard.values()) {
    spans.push(...bridgeEntries(list, ESTIMATE_GAP_MS))
  }
  return spans
}

const cellStyle: React.CSSProperties = {
  padding: '7px 10px',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  borderBottom: '1px solid var(--border-subtle)',
  borderRight: '1px solid var(--border-subtle)'
}

/** Tracked value with the bridged estimate underneath (when it adds anything). */
function TimeCell({ actual, est, bold }: { actual: number; est: number; bold?: boolean }): JSX.Element {
  return (
    <div className="flex flex-col items-end" style={{ lineHeight: 1.25 }}>
      <span style={bold ? { fontWeight: 600 } : undefined}>{actual >= 0.5 ? fmtHM(actual) : ''}</span>
      {est - actual >= 1 && (
        <span
          title="Estimated — activity gaps under an hour bridged (developing/reading between terminal touches)"
          style={{ fontSize: 11, color: 'var(--text-muted)' }}
        >
          ~{fmtHM(est)}
        </span>
      )}
    </div>
  )
}

export default function TimePanel(): JSX.Element {
  const cards = useBoardStore((s) => s.cards)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()))
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [timers, setTimers] = useState<ActiveTimer[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [addStart, setAddStart] = useState('')
  const [addEnd, setAddEnd] = useState('')
  const [timerCardId, setTimerCardId] = useState('')
  const [nowTick, setNowTick] = useState(Date.now())

  const weekEnd = weekStart + 7 * DAY_MS
  const thisWeek = startOfWeek(Date.now())

  const refetch = useCallback(async () => {
    try {
      const res = await window.api.getTimeLog(weekStart, weekEnd)
      setEntries(res.entries)
      setTimers(res.timers)
    } catch {
      // ignore
    }
  }, [weekStart, weekEnd])

  // First open: import history from transcripts, then load; refresh every 30s.
  useEffect(() => {
    window.api
      .backfillTimeLog()
      .catch(() => {})
      .then(() => refetch())
    const iv = setInterval(refetch, 30_000)
    return () => clearInterval(iv)
  }, [refetch])

  // Tick for live elapsed on running timers.
  useEffect(() => {
    if (timers.length === 0) return
    const iv = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [timers.length])

  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<string, Group>()
    for (const e of entries) {
      const jiraKey = extractJiraKey(e.title)
      const key = jiraKey ?? e.title
      let g = byKey.get(key)
      if (!g) {
        g = {
          key,
          jiraKey,
          title: e.title,
          entries: [],
          perDay: new Array(7).fill(0),
          estPerDay: new Array(7).fill(0),
          total: 0,
          estTotal: 0,
          running: false
        }
        byKey.set(key, g)
      }
      g.entries.push(e)
      if (e.running) g.running = true
    }
    for (const g of byKey.values()) {
      const estSpans = estimateSpans(g.entries)
      for (let d = 0; d < 7; d++) {
        const from = weekStart + d * DAY_MS
        g.perDay[d] = mergedMinutes(g.entries, from, from + DAY_MS)
        g.estPerDay[d] = mergedMinutes(estSpans, from, from + DAY_MS)
      }
      g.total = g.perDay.reduce((a, b) => a + b, 0)
      g.estTotal = g.estPerDay.reduce((a, b) => a + b, 0)
    }
    return [...byKey.values()].filter((g) => g.total >= 0.5).sort((a, b) => b.total - a.total)
  }, [entries, weekStart])

  const dayTotals = useMemo(() => {
    const actual = new Array<number>(7).fill(0)
    const est = new Array<number>(7).fill(0)
    const estSpans = estimateSpans(entries)
    for (let d = 0; d < 7; d++) {
      const from = weekStart + d * DAY_MS
      // Union across ALL entries: parallel sessions are still one human.
      actual[d] = mergedMinutes(entries, from, from + DAY_MS)
      est[d] = mergedMinutes(estSpans, from, from + DAY_MS)
    }
    return { actual, est }
  }, [entries, weekStart])
  const grandTotal = dayTotals.actual.reduce((a, b) => a + b, 0)
  const grandEstTotal = dayTotals.est.reduce((a, b) => a + b, 0)

  const exportCsv = (): void => {
    const lines = ['Jira Item,Card,Date,Hours,Estimated Hours']
    for (const g of groups) {
      for (let d = 0; d < 7; d++) {
        if (g.perDay[d] < 0.5 && g.estPerDay[d] < 0.5) continue
        const date = localDayKey(weekStart + d * DAY_MS)
        const title = '"' + g.title.replace(/"/g, '""') + '"'
        lines.push(
          `${g.jiraKey ?? ''},${title},${date},${(g.perDay[d] / 60).toFixed(2)},${(g.estPerDay[d] / 60).toFixed(2)}`
        )
      }
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `time-${localDayKey(weekStart)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const startEdit = (e: TimeEntry): void => {
    setEditId(e.id)
    setEditStart(toLocalInput(e.start))
    setEditEnd(toLocalInput(e.end))
  }
  const saveEdit = async (): Promise<void> => {
    if (!editId) return
    const s = fromLocalInput(editStart)
    const e = fromLocalInput(editEnd)
    if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
      await window.api.updateTimeEntry(editId, s, e)
      setEditId(null)
      refetch()
    }
  }

  const openAdd = (g: Group): void => {
    setAddingTo(g.key)
    const base = new Date()
    base.setMinutes(0, 0, 0)
    setAddStart(toLocalInput(base.getTime() - 3_600_000))
    setAddEnd(toLocalInput(base.getTime()))
  }
  const saveAdd = async (g: Group): Promise<void> => {
    const s = fromLocalInput(addStart)
    const e = fromLocalInput(addEnd)
    const ref = g.entries[0]
    if (ref && !Number.isNaN(s) && !Number.isNaN(e) && e > s) {
      await window.api.addTimeEntry(ref.cardId, ref.title, s, e)
      setAddingTo(null)
      refetch()
    }
  }

  const cardList = useMemo(
    () => Object.values(cards).sort((a, b) => a.title.localeCompare(b.title)),
    [cards]
  )
  const activeTimerCards = new Set(timers.map((t) => t.cardId))

  const dayHeaders = Array.from({ length: 7 }, (_, d) => {
    const date = new Date(weekStart + d * DAY_MS)
    return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
  })
  const todayIdx =
    weekStart === thisWeek ? Math.floor((Date.now() - weekStart) / DAY_MS) : -1

  const weekLabel = `${new Date(weekStart).toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${new Date(weekEnd - DAY_MS).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header (doubles as the window drag region, like the other panels) */}
      <div
        className="flex items-center gap-3 shrink-0"
        style={{ height: 52, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)', WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Time</h1>
        <div className="flex items-center gap-1" style={{ marginLeft: 12, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => setWeekStart(weekStart - 7 * DAY_MS)} title="Previous week" style={navBtn}>
            ‹
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 150, textAlign: 'center' }}>
            {weekLabel}
          </span>
          <button onClick={() => setWeekStart(weekStart + 7 * DAY_MS)} title="Next week" style={navBtn}>
            ›
          </button>
          {weekStart !== thisWeek && (
            <button onClick={() => setWeekStart(thisWeek)} style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: 12 }}>
              This week
            </button>
          )}
        </div>
        <div className="flex-1" />
        <button
          onClick={exportCsv}
          disabled={groups.length === 0}
          style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12, opacity: groups.length === 0 ? 0.5 : 1, WebkitAppRegion: 'no-drag', marginRight: 300 } as React.CSSProperties}
        >
          Export CSV
        </button>
      </div>

      {/* Manual timer bar */}
      <div
        className="flex items-center gap-2 shrink-0 flex-wrap"
        style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <select
          value={timerCardId}
          onChange={(e) => setTimerCardId(e.target.value)}
          style={{
            fontSize: 12,
            padding: '5px 8px',
            borderRadius: 6,
            backgroundColor: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-input)',
            maxWidth: 320
          }}
        >
          <option value="">Start a timer on a card…</option>
          {cardList.map((c) => (
            <option key={c.id} value={c.id} disabled={activeTimerCards.has(c.id)}>
              {c.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            const card = cards[timerCardId]
            if (!card) return
            window.api.startTimeTimer(card.id, card.title).then(refetch)
            setTimerCardId('')
          }}
          disabled={!timerCardId}
          style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12, opacity: timerCardId ? 1 : 0.5 }}
        >
          ▶ Start
        </button>
        {timers.map((t) => (
          <span
            key={t.cardId}
            className="flex items-center gap-2"
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid var(--accent)',
              color: 'var(--text-primary)'
            }}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
            {t.title.length > 34 ? t.title.slice(0, 34) + '…' : t.title}
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtHM((nowTick - t.start) / 60_000)}
            </span>
            <button
              onClick={() => window.api.stopTimeTimer(t.cardId).then(refetch)}
              title="Stop timer"
              style={{ color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}
            >
              ■
            </button>
          </span>
        ))}
      </div>

      {/* Week table */}
      <div
        className="flex-1 overflow-auto"
        style={{ padding: '12px 20px 12px', scrollbarGutter: 'stable' }}
      >
        {groups.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
            No tracked time this week. Work in a card's terminal (or start a timer) and it shows up here.
          </div>
        ) : (
          <table style={tableStyle}>
            <ColGroup />
            <thead>
              <tr style={{ color: 'var(--text-secondary)' }}>
                <th style={{ ...stickyHead, textAlign: 'left', fontWeight: 600 }}>Item</th>
                {dayHeaders.map((h, d) => (
                  <th
                    key={h}
                    style={{
                      ...stickyHead,
                      fontWeight: d === todayIdx ? 700 : 600,
                      color: d === todayIdx ? 'var(--accent)' : undefined,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {h}
                  </th>
                ))}
                <th style={{ ...stickyHead, fontWeight: 600, borderRight: 'none' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows
                  key={g.key}
                  group={g}
                  todayIdx={todayIdx}
                  expanded={expanded === g.key}
                  onToggle={() => setExpanded(expanded === g.key ? null : g.key)}
                  editId={editId}
                  editStart={editStart}
                  editEnd={editEnd}
                  setEditStart={setEditStart}
                  setEditEnd={setEditEnd}
                  startEdit={startEdit}
                  saveEdit={saveEdit}
                  cancelEdit={() => setEditId(null)}
                  onDelete={(id) => window.api.deleteTimeEntry(id).then(refetch)}
                  adding={addingTo === g.key}
                  addStart={addStart}
                  addEnd={addEnd}
                  setAddStart={setAddStart}
                  setAddEnd={setAddEnd}
                  openAdd={() => openAdd(g)}
                  saveAdd={() => saveAdd(g)}
                  cancelAdd={() => setAddingTo(null)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Totals bar — always pinned to the bottom of the view. The 26px right
          padding mirrors the scroll area's 20px + its 6px reserved scrollbar
          gutter so the columns line up. */}
      {groups.length > 0 && (
        <div
          className="shrink-0"
          style={{
            padding: '0 26px 10px 20px',
            borderTop: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-primary)'
          }}
        >
          <table style={{ ...tableStyle, borderTop: 'none' }}>
            <ColGroup />
            <tbody>
              <tr style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                <td style={{ ...cellStyle, textAlign: 'left', borderBottom: 'none' }}>Total</td>
                {dayTotals.actual.map((m, d) => (
                  <td
                    key={d}
                    style={{ ...cellStyle, borderBottom: 'none', color: d === todayIdx ? 'var(--accent)' : undefined }}
                  >
                    <TimeCell actual={m} est={dayTotals.est[d]} bold />
                  </td>
                ))}
                <td style={{ ...cellStyle, borderBottom: 'none', borderRight: 'none' }}>
                  <TimeCell actual={grandTotal} est={grandEstTotal} bold />
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 2px 0' }}>
            ~ estimated — activity on a card with gaps under an hour bridged, covering the
            developing/reading time between terminal touches. Tracked time is terminal activity only.
          </p>
        </div>
      )}
    </div>
  )
}

// Day header sticks to the top of the scroll area; the totals row lives in a
// fixed bar below it (a sticky tfoot only pins once the table overflows).
const stickyHead: React.CSSProperties = {
  ...cellStyle,
  position: 'sticky',
  top: 0,
  backgroundColor: 'var(--bg-primary)',
  zIndex: 1
}

// Both tables (scrolling rows + fixed totals bar) share this fixed column
// layout so their grid lines align.
const tableStyle: React.CSSProperties = {
  borderCollapse: 'separate',
  borderSpacing: 0,
  width: '100%',
  fontSize: 13,
  tableLayout: 'fixed',
  border: '1px solid var(--border-subtle)'
}
function ColGroup(): JSX.Element {
  return (
    <colgroup>
      <col />
      {Array.from({ length: 7 }, (_, d) => (
        <col key={d} style={{ width: 92 }} />
      ))}
      <col style={{ width: 96 }} />
    </colgroup>
  )
}

const navBtn: React.CSSProperties = {
  height: 26,
  width: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  backgroundColor: 'var(--bg-button)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 14
}

const srcColors: Record<string, string> = {
  auto: 'var(--text-muted)',
  manual: 'var(--accent)',
  backfill: 'var(--text-faint)'
}

interface GroupRowsProps {
  group: Group
  todayIdx: number
  expanded: boolean
  onToggle: () => void
  editId: string | null
  editStart: string
  editEnd: string
  setEditStart: (v: string) => void
  setEditEnd: (v: string) => void
  startEdit: (e: TimeEntry) => void
  saveEdit: () => void
  cancelEdit: () => void
  onDelete: (id: string) => void
  adding: boolean
  addStart: string
  addEnd: string
  setAddStart: (v: string) => void
  setAddEnd: (v: string) => void
  openAdd: () => void
  saveAdd: () => void
  cancelAdd: () => void
}

function GroupRows(props: GroupRowsProps): JSX.Element {
  const { group: g, todayIdx, expanded } = props
  const sortedEntries = [...g.entries].sort((a, b) => b.start - a.start)
  const inputStyle: React.CSSProperties = {
    fontSize: 12,
    padding: '3px 6px',
    borderRadius: 4,
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-input)'
  }
  return (
    <>
      <tr
        onClick={props.onToggle}
        style={{ cursor: 'pointer', backgroundColor: expanded ? 'var(--bg-surface)' : undefined }}
      >
        <td style={{ ...cellStyle, textAlign: 'left', maxWidth: 340 }}>
          <span className="flex items-center gap-2">
            {g.running && (
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                title="Active now"
                style={{ backgroundColor: '#16c60c' }}
              />
            )}
            {g.jiraKey ? (
              <>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{g.jiraKey}</span>
                <span
                  style={{
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {g.title}
                </span>
              </>
            ) : (
              <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.title}
              </span>
            )}
          </span>
        </td>
        {g.perDay.map((m, d) => (
          <td key={d} style={{ ...cellStyle, color: d === todayIdx ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            <TimeCell actual={m} est={g.estPerDay[d]} />
          </td>
        ))}
        <td style={{ ...cellStyle, borderRight: 'none', color: 'var(--text-primary)' }}>
          <TimeCell actual={g.total} est={g.estTotal} bold />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: '4px 10px 12px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
            <div className="flex flex-col gap-1" style={{ fontSize: 12 }}>
              {sortedEntries.map((e) => (
                <div key={e.id} className="flex items-center gap-3" style={{ padding: '2px 0', color: 'var(--text-secondary)' }}>
                  {props.editId === e.id ? (
                    <>
                      <input type="datetime-local" value={props.editStart} onChange={(ev) => props.setEditStart(ev.target.value)} style={inputStyle} />
                      <span>→</span>
                      <input type="datetime-local" value={props.editEnd} onChange={(ev) => props.setEditEnd(ev.target.value)} style={inputStyle} />
                      <button onClick={props.saveEdit} style={{ color: 'var(--accent)', cursor: 'pointer' }}>Save</button>
                      <button onClick={props.cancelEdit} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span style={{ minWidth: 76 }}>
                        {new Date(e.start).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmtClock(e.start)} – {e.running ? 'now' : fmtClock(e.end)}
                      </span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        {fmtHM((e.end - e.start) / 60_000)}
                      </span>
                      <span style={{ color: srcColors[e.source], fontSize: 11 }}>
                        {e.running ? 'live' : e.source}
                      </span>
                      {!e.running && (
                        <>
                          <button onClick={() => props.startEdit(e)} title="Edit" style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                            ✎
                          </button>
                          <button onClick={() => props.onDelete(e.id)} title="Delete" style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                            ✕
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
              {props.adding ? (
                <div className="flex items-center gap-3" style={{ padding: '4px 0' }}>
                  <input type="datetime-local" value={props.addStart} onChange={(ev) => props.setAddStart(ev.target.value)} style={inputStyle} />
                  <span>→</span>
                  <input type="datetime-local" value={props.addEnd} onChange={(ev) => props.setAddEnd(ev.target.value)} style={inputStyle} />
                  <button onClick={props.saveAdd} style={{ color: 'var(--accent)', cursor: 'pointer' }}>Add</button>
                  <button onClick={props.cancelAdd} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <button
                  onClick={props.openAdd}
                  style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 0' }}
                >
                  + Add entry
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
