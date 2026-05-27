import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSettingsStore } from '@/stores/settings-store'
import type { ITheme } from '@xterm/xterm'

export const XTERM_DARK: ITheme = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#f0f6fc',
  selectionBackground: '#264f78',
  black: '#484f58',
  red: '#ff7b72',
  green: '#7ee787',
  yellow: '#d29922',
  blue: '#79c0ff',
  magenta: '#d2a8ff',
  cyan: '#76e4f7',
  white: '#8b949e',
  brightBlack: '#484f58',
  brightRed: '#ffa198',
  brightGreen: '#aff5b4',
  brightYellow: '#e3b341',
  brightBlue: '#a5d6ff',
  brightMagenta: '#e2c5ff',
  brightCyan: '#a5f3fc',
  brightWhite: '#f0f6fc'
}

export const XTERM_LIGHT: ITheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#1f2328',
  selectionBackground: '#bde0fe',
  black: '#1f2328',
  red: '#cf222e',
  green: '#1a7f37',
  yellow: '#9a6700',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#afb8c1',
  brightRed: '#a40e26',
  brightGreen: '#116329',
  brightYellow: '#7c4d00',
  brightBlue: '#0550ae',
  brightMagenta: '#6639ba',
  brightCyan: '#136169',
  brightWhite: '#1f2328'
}

interface TerminalViewProps {
  sessionId: string
  isVisible: boolean
}

export default function TerminalView({ sessionId, isVisible }: TerminalViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const { theme: currentTheme, themeOverrides } = useSettingsStore.getState()
    const baseXterm = currentTheme === 'light' ? XTERM_LIGHT : XTERM_DARK
    const terminalOverrides = themeOverrides[currentTheme] ?? {}
    // Extract terminal-specific overrides (non-CSS-variable keys)
    const xtermOverrides: Record<string, string> = {}
    for (const [k, v] of Object.entries(terminalOverrides)) {
      if (!k.startsWith('--') && v) xtermOverrides[k] = v
    }
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Consolas', monospace",
      theme: { ...baseXterm, ...xtermOverrides },
      scrollback: 5000,
      convertEol: true
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)

    // Small delay for DOM to be ready
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Subscribe to theme and override changes for live switching
    let prevTheme = useSettingsStore.getState().theme
    let prevOverrides = useSettingsStore.getState().themeOverrides
    const unsubTheme = useSettingsStore.subscribe((state) => {
      if (state.theme !== prevTheme || state.themeOverrides !== prevOverrides) {
        prevTheme = state.theme
        prevOverrides = state.themeOverrides
        const base = state.theme === 'light' ? XTERM_LIGHT : XTERM_DARK
        const overrides = state.themeOverrides[state.theme] ?? {}
        const xo: Record<string, string> = {}
        for (const [k, v] of Object.entries(overrides)) {
          if (!k.startsWith('--') && v) xo[k] = v
        }
        terminal.options.theme = { ...base, ...xo }
      }
    })

    // Clipboard: Ctrl+C copies selection, Ctrl+V pastes
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true

      // Ctrl+C with selection → copy to clipboard, don't send SIGINT
      if (event.ctrlKey && event.key === 'c' && terminal.hasSelection()) {
        navigator.clipboard.writeText(terminal.getSelection())
        return false
      }

      // Ctrl+V → read clipboard and write directly to PTY
      if (event.ctrlKey && event.key === 'v') {
        event.preventDefault()
        navigator.clipboard.readText().then((text) => {
          if (text) window.api.writeSession(sessionId, text)
        })
        return false
      }

      return true
    })

    // Forward user input to PTY
    terminal.onData((data) => {
      window.api.writeSession(sessionId, data)
    })

    // Highlight user input lines (lines starting with > or ❯)
    terminal.onLineFeed(() => {
      try {
        const buf = terminal.buffer.active
        const prevLine = buf.baseY + buf.cursorY - 1
        if (prevLine < 0) return
        const line = buf.getLine(prevLine)
        if (!line) return
        const text = line.translateToString(true).trimStart()
        if (text.startsWith('>') || text.startsWith('\u276F')) {
          const marker = terminal.registerMarker(-1)
          if (marker) {
            const deco = terminal.registerDecoration({ marker })
            deco?.onRender((el) => {
              el.style.backgroundColor = 'rgba(200, 210, 230, 0.13)'
              el.style.width = `${terminal.cols}ch`
            })
          }
        }
      } catch {
        // ignore decoration errors
      }
    })

    // Replay buffer then subscribe to live data
    let cleanup: (() => void) | null = null

    window.api.getSessionBuffer(sessionId).then((buffer) => {
      if (buffer) terminal.write(buffer)

      // Subscribe to live data
      cleanup = window.api.onSessionData((sid, data) => {
        if (sid === sessionId) {
          terminal.write(data)
        }
      })
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        window.api.resizeSession(sessionId, terminal.cols, terminal.rows)
      } catch {
        // ignore
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unsubTheme()
      cleanup?.()
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  // Refit when visibility changes
  useEffect(() => {
    if (isVisible && fitAddonRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit()
          if (terminalRef.current) {
            window.api.resizeSession(sessionId, terminalRef.current.cols, terminalRef.current.rows)
          }
        } catch {
          // ignore
        }
      })
    }
  }, [isVisible, sessionId])

  return (
    <div
      className="h-full w-full"
      style={{ display: isVisible ? 'block' : 'none', padding: '8px 12px 0 12px' }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
