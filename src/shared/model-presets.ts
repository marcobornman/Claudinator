// Curated model choices for the pickers (Settings and per-card), newest
// first. 'sonnet'/'haiku' are aliases (latest in family); Fable 5 / Opus 5 /
// Opus 4.8 pin a specific version. '' means no --model flag (Claude Code's
// own default).
export const MODEL_PRESETS: { value: string; label: string }[] = [
  { value: 'claude-fable-5', label: 'Fable 5' },
  { value: 'claude-opus-5', label: 'Opus 5' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
  { value: '', label: 'Default' }
]

export function formatModelName(model: string): string {
  if (!model) return 'Latest (auto)'
  // Strip trailing date snapshot like -20250428
  const cleaned = model.replace(/-\d{8}$/, '')
  const parts = cleaned.split('-')
  if (parts[0] === 'claude' && parts.length >= 4) {
    const family = parts[1].charAt(0).toUpperCase() + parts[1].slice(1)
    const version = parts.slice(2).join('.')
    return `Claude ${family} ${version}`
  }
  return model
}
