import { useState, useEffect, useCallback } from 'react'
import type { UsageLimitsResult } from '@shared/usage'

// Sidebar ring showing the 5-hour session window %, with a popover breaking
// down every plan limit (session, weekly, model-scoped weekly) and its reset
// time — the numbers the CLI's /usage shows, without leaving the board.

function barColor(percent: number, severity: string): string {
  if (severity !== 'normal' || percent >= 90) return '#f85149'
  if (percent >= 70) return '#e8833a'
  return '#3fb950'
}

function resetsIn(resetsAt: string | null, now: number): string | null {
  if (!resetsAt) return null
  const ms = new Date(resetsAt).getTime() - now
  if (!(ms > 0)) return null
  const m = Math.floor(ms / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `Resets in ${d}d ${h}h`
  if (h > 0) return `Resets in ${h}h ${m % 60}m`
  return `Resets in ${m}m`
}

function updatedAgo(updatedAt: number, now: number): string {
  const m = Math.floor((now - updatedAt) / 60_000)
  if (m < 1) return 'Updated just now'
  if (m === 1) return 'Updated 1 minute ago'
  if (m < 60) return `Updated ${m} minutes ago`
  return `Updated ${Math.floor(m / 60)}h ago`
}

export default function ClaudeUsage(): JSX.Element | null {
  const [usage, setUsage] = useState<UsageLimitsResult | null>(null)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async (force = false) => {
    try {
      setUsage(await window.api.getUsageLimits(force))
      setNow(Date.now())
    } catch {
      // ignore — the button just stays hidden until data arrives
    }
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(() => refresh(), 5 * 60_000)
    return () => clearInterval(iv)
  }, [refresh])

  // Keep countdowns ticking while the popover is open.
  useEffect(() => {
    if (!open) return
    refresh()
    const iv = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(iv)
  }, [open, refresh])

  if (!usage || (usage.limits.length === 0 && !usage.error)) return null

  const session = usage.limits.find((l) => l.kind === 'session')
  const pct = session?.percent ?? 0
  const ringColor = barColor(pct, session?.severity ?? 'normal')
  const R = 11
  const C = 2 * Math.PI * R

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors cursor-pointer"
        style={{ color: 'var(--text-muted)', backgroundColor: open ? 'var(--bg-active)' : undefined }}
        title="Claude plan usage"
      >
        <svg width="30" height="30" viewBox="0 0 30 30">
          <circle cx="15" cy="15" r={R} fill="none" stroke="var(--bg-button)" strokeWidth="2.5" />
          <circle
            cx="15"
            cy="15"
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(C * pct) / 100} ${C}`}
            transform="rotate(-90 15 15)"
          />
        </svg>
        <span
          className="absolute font-medium"
          style={{ fontSize: 7.5, color: 'var(--text-secondary)' }}
        >
          {pct}%
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setOpen(false)} />
          <div
            className="fixed z-50"
            style={{
              left: 60,
              bottom: 16,
              width: 264,
              borderRadius: 12,
              border: '1px solid var(--accent)',
              backgroundColor: 'var(--bg-elevated)',
              boxShadow: '0 0 0 1px var(--border-primary), 0 20px 50px rgba(0,0,0,0.65)',
              padding: '14px 16px 12px'
            }}
          >
            <div className="flex items-center" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                Claude Usage
              </div>
              <button
                onClick={() => refresh(true)}
                className="cursor-pointer"
                title="Refresh"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2.5v2.6h-2.6" />
                </svg>
              </button>
              <button
                onClick={() => setOpen(false)}
                className="cursor-pointer"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 4L4 12M4 4l8 8" />
                </svg>
              </button>
            </div>

            {usage.limits.map((l) => {
              const reset = resetsIn(l.resetsAt, now)
              const color = barColor(l.percent, l.severity)
              return (
                <div key={l.kind + l.label} style={{ marginBottom: 14 }}>
                  <div className="flex items-baseline">
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                      {l.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color }}>{l.percent}%</span>
                  </div>
                  {l.subLabel && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{l.subLabel}</div>
                  )}
                  <div
                    style={{
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: 'var(--bg-button)',
                      marginTop: 6,
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${l.percent}%`,
                        borderRadius: 3,
                        backgroundColor: color,
                        transition: 'width 0.3s'
                      }}
                    />
                  </div>
                  {reset && (
                    <div className="flex items-center" style={{ gap: 5, fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                        <circle cx="8" cy="8" r="6.5" />
                        <path d="M8 4.5V8l2.5 1.5" />
                      </svg>
                      {reset}
                    </div>
                  )}
                </div>
              )
            })}

            {usage.error && (
              <div style={{ fontSize: 11, color: '#f87171', marginBottom: 10 }}>{usage.error}</div>
            )}

            <div
              style={{
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 8,
                fontSize: 11,
                color: 'var(--text-muted)'
              }}
            >
              {usage.updatedAt > 0 ? updatedAgo(usage.updatedAt, now) : '—'}
            </div>
          </div>
        </>
      )}
    </>
  )
}
