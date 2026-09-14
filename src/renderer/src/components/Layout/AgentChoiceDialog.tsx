import { useState } from 'react'
import { useSettingsStore } from '@/stores/settings-store'
import type { AgentEngine } from '@shared/model-presets'

/**
 * First-run chooser: shown once on a fresh install (no settings.json yet).
 * Picking an agent persists it as the explicit agentCli setting — changeable
 * later in Settings → General.
 */
export default function AgentChoiceDialog(): JSX.Element {
  const claudeFound = useSettingsStore((s) => s.claudeFound)
  const codexFound = useSettingsStore((s) => s.codexFound)
  const chooseAgent = useSettingsStore((s) => s.chooseAgent)
  // Preselect whatever is installed (claude when both or neither).
  const [picked, setPicked] = useState<AgentEngine>(!claudeFound && codexFound ? 'codex' : 'claude')
  const [saving, setSaving] = useState(false)

  const options: { value: AgentEngine; name: string; blurb: string; found: boolean }[] = [
    {
      value: 'claude',
      name: 'Claude Code',
      blurb: 'Anthropic’s Claude in your terminal. Uses your Claude subscription.',
      found: claudeFound
    },
    {
      value: 'codex',
      name: 'Codex',
      blurb: 'OpenAI’s Codex CLI. Uses your ChatGPT subscription.',
      found: codexFound
    }
  ]

  const confirm = async (): Promise<void> => {
    setSaving(true)
    try {
      await chooseAgent(picked)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(6px)' }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          borderRadius: 14,
          border: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-elevated)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          padding: 28
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          Choose your agent
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Which CLI should power your sessions? You can change this any time in Settings → General.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {options.map((opt) => {
            const active = picked === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPicked(opt.value)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  borderRadius: 10,
                  padding: '16px 16px 14px',
                  cursor: 'pointer',
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--border-input)'}`,
                  backgroundColor: active ? 'var(--bg-active)' : 'var(--bg-input)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.name}</span>
                  {active && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 4L6 11 3 8" />
                    </svg>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
                  {opt.blurb}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: opt.found ? '#3fb950' : '#e8833a' }}>
                  {opt.found ? '● Installed' : '○ Not found on PATH'}
                </div>
              </button>
            )
          })}
        </div>

        {!options.find((o) => o.value === picked)?.found && (
          <p style={{ fontSize: 12, color: '#e8833a', marginBottom: 14 }}>
            This CLI wasn&apos;t found — sessions won&apos;t start until it&apos;s installed and on your PATH.
          </p>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={saving}
          style={{
            width: '100%',
            borderRadius: 8,
            padding: '11px 16px',
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            cursor: saving ? 'default' : 'pointer',
            backgroundColor: 'var(--accent)',
            color: '#fff',
            opacity: saving ? 0.7 : 1
          }}
        >
          {saving ? 'Saving…' : `Continue with ${options.find((o) => o.value === picked)?.name}`}
        </button>
      </div>
    </div>
  )
}
