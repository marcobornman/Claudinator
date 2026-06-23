import { useEffect, useState } from 'react'

/**
 * Standalone renderer for the detached preview BrowserWindow (loaded at the
 * `#preview` route). It owns no note state — it just renders whatever rendered
 * HTML + theme the editor window streams over via the main process.
 */
export default function PreviewWindow(): JSX.Element {
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const unsub = window.api.onPreviewData((data) => {
      setHtml(data.html)
      setTitle(data.title)
      document.documentElement.setAttribute('data-theme', data.theme)
      // Any incoming payload (incl. the reload we requested) clears the spinner.
      setRefreshing(false)
    })
    // Now that the listener is attached, ask main for the current payload.
    window.api.previewReady()
    return unsub
  }, [])

  useEffect(() => {
    document.title = title ? `${title} — Preview` : 'Markdown Preview'
  }, [title])

  const refresh = (): void => {
    setRefreshing(true)
    window.api.requestPreviewRefresh()
    // Safety: stop spinning even if the file was unchanged (no new payload).
    window.setTimeout(() => setRefreshing(false), 1500)
  }

  return (
    <>
      <button
        onClick={refresh}
        disabled={refreshing}
        title="Reload from disk"
        aria-label="Reload preview from disk"
        style={{
          position: 'fixed',
          top: 10,
          right: 14,
          zIndex: 50,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          cursor: refreshing ? 'default' : 'pointer',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          opacity: refreshing ? 0.6 : 0.85
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={refreshing ? 'animate-spin' : ''}
        >
          <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
          <path d="M13.5 2v3h-3" />
        </svg>
      </button>
      <div
        className="md-preview"
        style={{
          height: '100vh',
          overflowY: 'auto',
          padding: '20px 26px',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)'
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}
