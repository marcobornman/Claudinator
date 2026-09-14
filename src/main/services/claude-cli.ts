export function buildClaudeArgs(
  _name: string,
  resumeSessionId?: string | null,
  model?: string,
  newSessionId?: string | null
): string {
  const parts = ['claude']
  if (model) {
    parts.push('--model', `'${model.replace(/'/g, "''")}'`)
  }
  if (resumeSessionId) {
    parts.push('--resume', `'${resumeSessionId.replace(/'/g, "''")}'`)
  } else if (newSessionId) {
    // Fresh sessions launch with an app-generated id, so the card is bound to
    // its conversation with certainty instead of guessing from the filesystem.
    parts.push('--session-id', `'${newSessionId.replace(/'/g, "''")}'`)
  }
  return parts.join(' ')
}

// Codex has no --session-id equivalent (it generates its own id); fresh
// sessions are bound afterwards by rollout-file detection (session_meta.cwd).
export function buildCodexArgs(resumeSessionId?: string | null, model?: string): string {
  const parts = ['codex']
  if (resumeSessionId) {
    parts.push('resume', `'${resumeSessionId.replace(/'/g, "''")}'`)
  }
  if (model) {
    parts.push('--model', `'${model.replace(/'/g, "''")}'`)
  }
  return parts.join(' ')
}
