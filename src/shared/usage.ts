// Claude plan usage limits (the 5-hour session window and 7-day windows),
// fetched from the same OAuth endpoint the Claude Code CLI's /usage uses.

export interface UsageLimit {
  kind: string // 'session' | 'weekly_all' | 'weekly_scoped' | ...
  group: string // 'session' | 'weekly'
  label: string // 'Session', 'Weekly', 'Weekly · Fable'
  subLabel: string // '5-hour window', '7-day window'
  percent: number
  severity: string // 'normal' | 'warning' | ...
  resetsAt: string | null // ISO timestamp
}

export interface UsageLimitsResult {
  limits: UsageLimit[]
  updatedAt: number // ms epoch of the successful fetch (0 = never)
  error?: string
}
