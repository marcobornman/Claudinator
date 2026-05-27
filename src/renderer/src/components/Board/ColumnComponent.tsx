import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Column, Card, ColumnId } from '@shared/models'
import CardComponent from './CardComponent'

const COLUMN_COLOR: Record<ColumnId, { dot: string; border: string }> = {
  'todo': { dot: 'bg-slate-400', border: 'border-b-slate-400' },
  'in-progress': { dot: 'bg-blue-400', border: 'border-b-blue-400' },
  'to-review': { dot: 'bg-amber-400', border: 'border-b-amber-400' },
  'testing': { dot: 'bg-purple-400', border: 'border-b-purple-400' },
  'done': { dot: 'bg-emerald-400', border: 'border-b-emerald-400' },
}

interface ColumnComponentProps {
  column: Column
  cards: Card[]
  onEditCard: (card: Card) => void
}

export default function ColumnComponent({
  column,
  cards,
  onEditCard
}: ColumnComponentProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const [collapsed, setCollapsed] = useState(false)
  const colors = COLUMN_COLOR[column.id] ?? { dot: 'bg-slate-400', border: 'border-b-slate-400' }

  return (
    <div
      className={`flex flex-1 flex-col rounded-xl overflow-hidden ${
        isOver ? 'ring-1 ring-blue-500/30' : ''
      }`}
      style={{
        border: '1px solid var(--column-border)',
        backgroundColor: 'var(--column-bg)',
      }}
    >
      {/* Column header tab */}
      <div className={`flex items-center gap-3 border-b-2 ${colors.border}`} style={{ minHeight: 56, paddingLeft: 20, paddingRight: 20, backgroundColor: 'var(--bg-header)' }}>
        <span className={`h-3 w-3 shrink-0 rounded-full ${colors.dot}`} />
        <h2 className="text-xs font-semibold tracking-widest uppercase flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
          {column.title}
        </h2>
        <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: 'var(--bg-button)', color: 'var(--text-secondary)' }}>
          {cards.length}
        </span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 transition-colors p-1"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={`transition-transform ${collapsed ? '-rotate-90' : 'rotate-0'}`}
          >
            <path d="M4.5 6.5l3.5 3 3.5-3" />
          </svg>
        </button>
      </div>

      {/* Cards */}
      {!collapsed && (
        <>
          <div
            ref={setNodeRef}
            className="flex flex-1 flex-col overflow-y-auto"
            style={{ minHeight: 50, padding: '10px 12px', gap: 10 }}
          >
            <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
              {cards.map((card) => (
                <CardComponent key={card.id} card={card} onEdit={() => onEditCard(card)} />
              ))}
            </SortableContext>
          </div>
        </>
      )}
    </div>
  )
}
