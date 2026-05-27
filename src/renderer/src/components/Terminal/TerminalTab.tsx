import { useSessionStore } from '@/stores/session-store'
import { useBoardStore } from '@/stores/board-store'

interface TerminalTabProps {
  sessionId: string
  isActive: boolean
}

export default function TerminalTab({ sessionId, isActive }: TerminalTabProps): JSX.Element {
  const session = useSessionStore((s) => s.sessions[sessionId])
  const cards = useBoardStore((s) => s.cards)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const closeTab = useSessionStore((s) => s.closeTab)

  const card = session ? cards[session.cardId] : null
  const title = card?.title ?? 'Session'
  const isRunning = session?.status === 'running'
  const isStopped = session?.status === 'stopped'

  return (
    <button
      onClick={() => setActiveSession(sessionId)}
      className="group flex items-center gap-2 border-b-2 px-3 py-1.5 text-xs transition-colors"
      style={{
        borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
        color: isActive ? 'var(--text-primary)' : isStopped ? 'var(--text-muted)' : 'var(--text-secondary)',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: isRunning ? '#22c55e' : 'var(--border-primary)' }}
      />
      <span className={`max-w-32 truncate ${isStopped && !isActive ? 'opacity-60' : ''}`}>
        {title}
        {isStopped && <span style={{ marginLeft: 4, color: 'var(--text-muted)' }}>(exited)</span>}
      </span>
      <span
        onClick={(e) => {
          e.stopPropagation()
          closeTab(sessionId)
        }}
        className="ml-1 flex items-center justify-center rounded p-0.5 opacity-0 group-hover:opacity-100"
        style={{ color: 'var(--text-muted)' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </span>
    </button>
  )
}
