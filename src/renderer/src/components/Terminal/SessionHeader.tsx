import { useSessionStore } from '@/stores/session-store'
import { useBoardStore } from '@/stores/board-store'

interface SessionHeaderProps {
  sessionId: string
}

export default function SessionHeader({ sessionId }: SessionHeaderProps): JSX.Element {
  const session = useSessionStore((s) => s.sessions[sessionId])
  const openTabs = useSessionStore((s) => s.openTabs)
  const sessions = useSessionStore((s) => s.sessions)
  const setViewingSession = useSessionStore((s) => s.setViewingSession)

  const cards = useBoardStore((s) => s.cards)

  const card = session ? cards[session.cardId] : null
  const title = card?.title ?? 'Session'
  const isRunning = session?.status === 'running'

  return (
    <div className="shrink-0" style={{ borderBottom: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-surface)' }}>
      {/* Main header row */}
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          onClick={() => setViewingSession(null)}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11L5 7l4-4" />
          </svg>
          Board
        </button>

        <div style={{ height: 16, width: 1, backgroundColor: 'var(--border-primary)' }} />

        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: isRunning ? '#22c55e' : 'var(--border-primary)',
              boxShadow: isRunning ? '0 0 4px rgba(34,197,94,0.6)' : 'none',
            }}
          />
          <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{title}</span>
          {!isRunning && session && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(exited)</span>
          )}
        </div>

        {card?.projectDir && (
          <>
            <div style={{ height: 16, width: 1, backgroundColor: 'var(--border-primary)' }} />
            <span className="text-xs truncate max-w-64" style={{ color: 'var(--text-muted)' }} title={card.projectDir}>
              {card.projectDir}
            </span>
          </>
        )}

        <div className="flex-1" />
      </div>

      {/* Session tabs (when multiple sessions open) */}
      {openTabs.length > 1 && (
        <div className="flex gap-0 overflow-x-auto px-1" style={{ borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
          {openTabs.map((tabId) => {
            const tabSession = sessions[tabId]
            const tabCard = tabSession ? cards[tabSession.cardId] : null
            const tabTitle = tabCard?.title ?? 'Session'
            const tabRunning = tabSession?.status === 'running'
            const isActive = tabId === sessionId

            return (
              <button
                key={tabId}
                onClick={() => setViewingSession(tabId)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 transition-colors"
                style={{
                  borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : tabRunning ? 'var(--text-secondary)' : 'var(--text-muted)',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: tabRunning ? '#22c55e' : 'var(--border-primary)' }}
                />
                <span className="max-w-28 truncate">{tabTitle}</span>
                {!tabRunning && tabSession && (
                  <span style={{ color: 'var(--text-faint)' }}>(exited)</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
