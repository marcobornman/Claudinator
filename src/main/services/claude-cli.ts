export function buildClaudeArgs(_name: string, resumeSessionId?: string | null): string {
  const parts = ['claude']
  if (resumeSessionId) {
    parts.push('--resume', `'${resumeSessionId.replace(/'/g, "''")}'`)
  }
  return parts.join(' ')
}
