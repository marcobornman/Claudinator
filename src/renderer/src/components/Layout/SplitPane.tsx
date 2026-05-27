import { useState, useCallback, useRef, useEffect } from 'react'

interface SplitPaneProps {
  top: React.ReactNode
  bottom: React.ReactNode
  defaultTopPercent?: number
  minTopPx?: number
  minBottomPx?: number
}

export default function SplitPane({
  top,
  bottom,
  defaultTopPercent = 55,
  minTopPx = 150,
  minBottomPx = 150
}: SplitPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [topPercent, setTopPercent] = useState(defaultTopPercent)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent): void => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const totalHeight = rect.height
      const y = e.clientY - rect.top
      const percent = (y / totalHeight) * 100

      // Enforce min sizes
      const minTopPct = (minTopPx / totalHeight) * 100
      const minBottomPct = (minBottomPx / totalHeight) * 100
      const maxPct = 100 - minBottomPct

      setTopPercent(Math.min(maxPct, Math.max(minTopPct, percent)))
    }

    const handleMouseUp = (): void => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, minTopPx, minBottomPx])

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      <div style={{ height: `${topPercent}%` }} className="overflow-hidden">
        {top}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="flex h-2 shrink-0 cursor-row-resize items-center justify-center"
        style={{
          borderTop: '1px solid var(--border-primary)',
          borderBottom: '1px solid var(--border-primary)',
          backgroundColor: isDragging ? 'var(--resize-handle-hover)' : 'var(--bg-surface)',
        }}
      >
        <div className="h-0.5 w-12 rounded" style={{ backgroundColor: 'var(--resize-handle)' }} />
      </div>

      <div style={{ height: `${100 - topPercent}%` }} className="overflow-hidden">
        {bottom}
      </div>

      {/* Prevent text selection while dragging */}
      {isDragging && <div className="fixed inset-0 z-50 cursor-row-resize" />}
    </div>
  )
}
