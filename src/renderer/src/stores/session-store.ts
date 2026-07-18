import { create } from 'zustand'
import { SessionInfo, SessionStatus } from '@shared/models'
import { useBoardStore } from './board-store'

type ViewName = 'board' | 'sessions' | 'notes' | 'dashboard'

interface SessionState {
  sessions: Record<string, SessionInfo>
  activeSessionId: string | null
  openTabs: string[] // session IDs
  viewingSessionId: string | null // full-screen session view
  currentView: ViewName
}

interface SessionActions {
  startSession: (cardId: string, cardTitle: string, projectDir: string, claudeSessionId?: string | null) => Promise<SessionInfo>
  startSessionInline: (cardId: string, cardTitle: string, projectDir: string, claudeSessionId?: string | null) => Promise<SessionInfo>
  stopSession: (sessionId: string) => Promise<void>
  setActiveSession: (sessionId: string | null) => void
  openTab: (sessionId: string) => void
  closeTab: (sessionId: string) => void
  setViewingSession: (sessionId: string | null) => void
  updateSessionStatus: (sessionId: string, status: SessionStatus) => void
  removeSession: (sessionId: string) => void
  setCurrentView: (view: ViewName) => void
  initListeners: () => () => void
}

type SessionStore = SessionState & SessionActions

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  openTabs: [],
  viewingSessionId: null,
  currentView: 'board',

  startSession: async (cardId, cardTitle, projectDir, claudeSessionId) => {
    const info = await window.api.startSession({ cardId, cardTitle, projectDir, claudeSessionId })
    set((state) => ({
      sessions: { ...state.sessions, [info.id]: info },
      openTabs: state.openTabs.includes(info.id) ? state.openTabs : [...state.openTabs, info.id],
      activeSessionId: info.id,
      viewingSessionId: info.id
    }))
    return info
  },

  // Like startSession but does not open the full-screen modal — used for the
  // inline CLI pane embedded in the Notes editor.
  startSessionInline: async (cardId, cardTitle, projectDir, claudeSessionId) => {
    const info = await window.api.startSession({ cardId, cardTitle, projectDir, claudeSessionId })
    set((state) => ({
      sessions: { ...state.sessions, [info.id]: info },
      openTabs: state.openTabs.includes(info.id) ? state.openTabs : [...state.openTabs, info.id]
    }))
    return info
  },

  stopSession: async (sessionId) => {
    await window.api.stopSession(sessionId)
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, status: 'stopped' }
        }
      }
    })
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
  },

  openTab: (sessionId) => {
    set((state) => ({
      openTabs: state.openTabs.includes(sessionId)
        ? state.openTabs
        : [...state.openTabs, sessionId],
      activeSessionId: sessionId,
      viewingSessionId: sessionId
    }))
  },

  closeTab: (sessionId) => {
    set((state) => {
      const newTabs = state.openTabs.filter((id) => id !== sessionId)
      const newActive =
        state.activeSessionId === sessionId
          ? newTabs[newTabs.length - 1] ?? null
          : state.activeSessionId
      return { openTabs: newTabs, activeSessionId: newActive }
    })
  },

  setViewingSession: (sessionId) => {
    set((state) => ({
      viewingSessionId: sessionId,
      activeSessionId: sessionId ?? state.activeSessionId
    }))
  },

  updateSessionStatus: (sessionId, status) => {
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, status }
        }
      }
    })
  },

  setCurrentView: (view) => {
    set({ currentView: view })
  },

  removeSession: (sessionId) => {
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions
      return {
        sessions: rest,
        openTabs: state.openTabs.filter((id) => id !== sessionId),
        activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId
      }
    })
  },

  initListeners: () => {
    // Native OS notification when a session flips to an attention state.
    // Prefs live in localStorage (default on, same pattern as the dashboard);
    // a per-session cooldown keeps prompt-redraw flapping from spamming toasts.
    const lastNotified = new Map<string, number>()
    const NOTIFY_COOLDOWN_MS = 20000

    const sessionTitle = (session: SessionInfo): string => {
      if (session.cardId.startsWith('notes:')) return session.cardId.slice('notes:'.length)
      return useBoardStore.getState().cards[session.cardId]?.title ?? 'Session'
    }

    const maybeNotify = (sessionId: string, from: SessionStatus, to: SessionStatus): void => {
      if (to !== 'decision' && to !== 'waiting') return
      // Only ping on the transition out of active work — re-renders of an
      // already-flagged prompt shouldn't fire again.
      if (from !== 'running' && from !== 'starting') return
      const now = Date.now()
      if (now - (lastNotified.get(sessionId) ?? 0) < NOTIFY_COOLDOWN_MS) return
      const focused = document.hasFocus()
      // Subtle nudge: flash the taskbar icon when the app isn't focused.
      const wantFlash = !focused && localStorage.getItem('notify-flash') !== 'off'
      // OS toast — skipped when the user is already looking at this session.
      const wantToast =
        localStorage.getItem(to === 'decision' ? 'notify-decision' : 'notify-waiting') !== 'off' &&
        !(focused && get().viewingSessionId === sessionId)
      if (!wantFlash && !wantToast) return
      lastNotified.set(sessionId, now)
      const session = get().sessions[sessionId]
      if (!session) return
      if (wantFlash) window.api.flashFrame()
      if (wantToast) {
        window.api.notify({
          title: sessionTitle(session),
          body:
            to === 'decision'
              ? 'Claude is waiting for a decision'
              : 'Claude has finished — waiting for your prompt',
          sessionId
        })
      }
    }

    // Attention detection (decision vs waiting vs running) lives in the main
    // process (session-manager) — the store just mirrors its status events.
    const unsubStatus = window.api.onSessionStatus((sessionId, status) => {
      const session = get().sessions[sessionId]
      if (!session || session.status === status) return
      maybeNotify(sessionId, session.status, status)
      get().updateSessionStatus(sessionId, status)
    })

    const unsubExit = window.api.onSessionExit((sessionId, _code) => {
      lastNotified.delete(sessionId)
      get().updateSessionStatus(sessionId, 'stopped')
    })

    // Clicking a notification focuses the app (handled in main) and opens the
    // session it came from.
    const unsubNotifyClick = window.api.onNotificationClick((sessionId) => {
      if (get().sessions[sessionId]) get().openTab(sessionId)
    })

    const unsubClaudeId = window.api.onClaudeSessionId((sessionId, claudeConversationId) => {
      const session = get().sessions[sessionId]
      if (session) {
        // Update the session info in this store so UI components react immediately
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: { ...state.sessions[sessionId], claudeSessionId: claudeConversationId }
          }
        }))
        // Persist for resume across restarts. Notes sessions use a synthetic
        // cardId of `notes:<name>` and are linked to the note instead of a card.
        if (session.cardId.startsWith('notes:')) {
          const noteName = session.cardId.slice('notes:'.length)
          window.api.setNoteSession(noteName, claudeConversationId)
        } else {
          useBoardStore.getState().updateCard(session.cardId, { claudeSessionId: claudeConversationId })
        }
      }
    })

    return () => {
      unsubStatus()
      unsubExit()
      unsubClaudeId()
      unsubNotifyClick()
    }
  }
}))
