// Which agent CLI powers sessions. '' in settings means auto-detect from
// what's installed on the machine (claude wins when both are present).
export type AgentEngine = 'claude' | 'codex'

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

// Codex model slugs (from the CLI's own model list; `codex -m <slug>`).
export const CODEX_MODEL_PRESETS: { value: string; label: string }[] = [
  { value: 'gpt-6-astra', label: 'GPT-6-Astra' },
  { value: 'gpt-reserve', label: 'GPT-Reserve' },
  { value: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
  { value: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
  { value: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: '', label: 'Default' }
]

export function presetsForEngine(engine: AgentEngine): { value: string; label: string }[] {
  return engine === 'codex' ? CODEX_MODEL_PRESETS : MODEL_PRESETS
}

/** True when a model id plausibly belongs to the other engine — used to drop
 *  a stale per-card override after the Agent setting was switched. */
export function modelFitsEngine(model: string, engine: AgentEngine): boolean {
  if (!model) return true
  const isClaude = /^(claude|sonnet|haiku|opus)/i.test(model)
  const isCodex = /^(gpt|codex|o\d)/i.test(model)
  if (engine === 'codex') return !isClaude
  return !isCodex
}

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
  if (/^gpt/i.test(cleaned)) {
    return cleaned
      .split('-')
      .map((p, i) => (i === 0 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
      .join('-')
  }
  return model
}
