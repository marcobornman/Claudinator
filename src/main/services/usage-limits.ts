// Claude plan usage limits, read the same way the CLI's /usage does: the
// OAuth access token from ~/.claude/.credentials.json against the usage
// endpoint. Strictly read-only on the credential file — refreshing the token
// is the CLI's job (any running session keeps it fresh).

import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { UsageLimit, UsageLimitsResult } from '../../shared/usage'

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const CACHE_MS = 60_000

let cached: UsageLimitsResult | null = null
let inflight: Promise<UsageLimitsResult> | null = null

interface RawLimit {
  kind?: string
  group?: string
  percent?: number
  severity?: string
  resets_at?: string | null
  scope?: { model?: { display_name?: string | null } | null } | null
}

function normalize(raw: RawLimit): UsageLimit {
  const group = raw.group ?? ''
  const scopeName = raw.scope?.model?.display_name
  let label: string
  if (raw.kind === 'session') label = 'Session'
  else if (raw.kind === 'weekly_all') label = 'Weekly'
  else if (scopeName) label = `Weekly · ${scopeName}`
  else label = raw.kind ?? 'Limit'
  return {
    kind: raw.kind ?? '',
    group,
    label,
    subLabel: group === 'session' ? '5-hour window' : group === 'weekly' ? '7-day window' : '',
    percent: Math.max(0, Math.min(100, Math.round(raw.percent ?? 0))),
    severity: raw.severity ?? 'normal',
    resetsAt: raw.resets_at ?? null
  }
}

async function fetchLimits(): Promise<UsageLimitsResult> {
  try {
    const raw = await readFile(join(homedir(), '.claude', '.credentials.json'), 'utf8')
    const token: string | undefined = JSON.parse(raw)?.claudeAiOauth?.accessToken
    if (!token) throw new Error('No Claude Code login found')
    const res = await fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }
    })
    if (res.status === 401) {
      throw new Error('Login token expired — running any Claude session refreshes it')
    }
    if (!res.ok) throw new Error(`Usage endpoint returned ${res.status}`)
    const data = (await res.json()) as { limits?: RawLimit[] }
    cached = {
      limits: (data.limits ?? []).map(normalize),
      updatedAt: Date.now()
    }
    return cached
  } catch (err) {
    // Serve the last good data alongside the error so the UI can stay useful.
    return {
      limits: cached?.limits ?? [],
      updatedAt: cached?.updatedAt ?? 0,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function getUsageLimits(force = false): Promise<UsageLimitsResult> {
  if (!force && cached && Date.now() - cached.updatedAt < CACHE_MS) return cached
  if (!inflight) {
    inflight = fetchLimits().finally(() => {
      inflight = null
    })
  }
  return inflight
}
