const TAG_COLORS_DARK = [
  { bg: '#1e3a5f', border: '#2563eb', text: '#93c5fd' }, // blue
  { bg: '#1a3a2a', border: '#16a34a', text: '#86efac' }, // green
  { bg: '#3b1c4a', border: '#9333ea', text: '#d8b4fe' }, // purple
  { bg: '#3a2518', border: '#ea580c', text: '#fdba74' }, // orange
  { bg: '#3a1c2e', border: '#db2777', text: '#f9a8d4' }, // pink
  { bg: '#1a3a3a', border: '#0d9488', text: '#5eead4' }, // teal
  { bg: '#3a3518', border: '#ca8a04', text: '#fde68a' }, // yellow
  { bg: '#2a1a1a', border: '#dc2626', text: '#fca5a5' }, // red
]

const TAG_COLORS_LIGHT = [
  { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }, // blue
  { bg: '#dcfce7', border: '#22c55e', text: '#166534' }, // green
  { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' }, // purple
  { bg: '#ffedd5', border: '#f97316', text: '#9a3412' }, // orange
  { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' }, // pink
  { bg: '#ccfbf1', border: '#14b8a6', text: '#115e59' }, // teal
  { bg: '#fef9c3', border: '#eab308', text: '#854d0e' }, // yellow
  { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }, // red
]

export function getTagColor(tag: string, theme: 'dark' | 'light' = 'dark'): { bg: string; border: string; text: string } {
  const palette = theme === 'light' ? TAG_COLORS_LIGHT : TAG_COLORS_DARK
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0
  }
  return palette[Math.abs(hash) % palette.length]
}
