import { useSessionStore } from '@/stores/session-store'
import TerminalTab from './TerminalTab'
import TerminalView from './TerminalView'

export default function TerminalPanel(): JSX.Element {
  const openTabs = useSessionStore((s) => s.openTabs)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  if (openTabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Start a session on a card to see the terminal here
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 gap-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-surface)' }}>
        {openTabs.map((sessionId) => (
          <TerminalTab
            key={sessionId}
            sessionId={sessionId}
            isActive={sessionId === activeSessionId}
          />
        ))}
      </div>

      {/* Terminal views */}
      <div className="relative flex-1 overflow-hidden">
        {openTabs.map((sessionId) => (
          <TerminalView
            key={sessionId}
            sessionId={sessionId}
            isVisible={sessionId === activeSessionId}
          />
        ))}
      </div>
    </div>
  )
}
