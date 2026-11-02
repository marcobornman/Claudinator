import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, dirname, extname } from 'path'
import { homedir } from 'os'
import { open, readFile, writeFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import {
  MODEL_PRESETS,
  CODEX_MODEL_PRESETS,
  type AgentEngine
} from '@shared/model-presets'

const execFileAsync = promisify(execFile)

export interface ModelPreset {
  value: string
  label: string
}

export interface ModelCatalog {
  claude: ModelPreset[]
  codex: ModelPreset[]
}

const DEFAULT_ENTRY: ModelPreset = { value: '', label: 'Default' }

// ---------------------------------------------------------------------------
// Codex: the CLI maintains ~/.codex/models_cache.json itself (slug, display
// name, visibility, retirement). Reading it IS the CLI's own model list.
// ---------------------------------------------------------------------------

interface CodexCacheModel {
  slug?: string
  display_name?: string
  visibility?: string
  upgrade?: { retirement_at?: string } | null
}

async function codexModels(): Promise<ModelPreset[]> {
  try {
    const raw = await readFile(join(homedir(), '.codex', 'models_cache.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { models?: CodexCacheModel[] }
    const now = Date.now()
    const models = (parsed.models ?? [])
      .filter((m) => m.slug && m.visibility === 'list')
      // A past retirement date means the CLI will refuse the model.
      .filter((m) => {
        const retiresAt = m.upgrade?.retirement_at
        return !retiresAt || Date.parse(retiresAt) > now
      })
      .map((m) => ({ value: m.slug!, label: m.display_name || m.slug! }))
    return models.length > 0 ? [...models, DEFAULT_ENTRY] : CODEX_MODEL_PRESETS
  } catch {
    return CODEX_MODEL_PRESETS
  }
}

// ---------------------------------------------------------------------------
// Claude: no list file exists, but every model id ships inside the CLI binary.
// Scan it for ids shaped like claude-<family>-<major>[-<minor>] (date-pinned
// snapshots and internal -v1 variants don't match), keep the current
// generations, and label them the way the CLI's own /model menu does. The scan
// is cached against the binary's mtime+size, so it reruns exactly when the CLI
// is updated and is a file read otherwise.
// ---------------------------------------------------------------------------

const FAMILY_RANK: Record<string, number> = { fable: 0, opus: 1, sonnet: 2, haiku: 3 }
// Boundary lookahead: without it, date-pinned ids (claude-opus-4-5-20251101,
// claude-opus-4-20250514) would yield a prefix or a date-as-minor. Capping the
// minor at 2 digits plus rejecting a following -<digit> skips them whole.
const CLAUDE_ID_RE = /claude-(fable|opus|sonnet|haiku)-(\d{1,2})(?:-(\d{1,2}))?(?!\d|-\d)/g

/** Resolve the claude binary on disk. `where` returns the PATH shims (.cmd /
 *  .ps1 for an npm install); the real exe sits in the npm package next to
 *  them, or is the result itself for a native install. */
async function findClaudeBinary(): Promise<string | null> {
  let lines: string[] = []
  try {
    const { stdout } = await execFileAsync(
      process.platform === 'win32' ? 'where.exe' : 'which',
      ['claude'],
      { windowsHide: true, timeout: 5000 }
    )
    lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  } catch {
    return null
  }
  const candidates: string[] = []
  for (const line of lines) {
    // npm shims (.cmd/.ps1/extensionless scripts) are tiny launchers — the
    // real exe they run lives in the package next to them. Prefer it.
    candidates.push(
      join(dirname(line), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    )
    const ext = extname(line).toLowerCase()
    if (ext === '.exe' || (process.platform !== 'win32' && ext === '')) candidates.push(line)
  }
  // Native (non-npm) installer location.
  candidates.push(join(homedir(), '.local', 'bin', 'claude.exe'))
  return candidates.find((c) => existsSync(c)) ?? null
}

/** Stream the binary through a regex in chunks (it is ~100MB — never whole). */
async function scanClaudeBinary(path: string): Promise<string[]> {
  const CHUNK = 8 * 1024 * 1024
  const OVERLAP = 64 // longer than any model id, so none is split across reads
  const found = new Set<string>()
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.alloc(CHUNK + OVERLAP)
    let pos = 0
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos)
      if (bytesRead === 0) break
      const text = buf.toString('latin1', 0, bytesRead)
      for (const m of text.matchAll(CLAUDE_ID_RE)) found.add(m[0])
      if (bytesRead < buf.length) break
      pos += CHUNK // next read re-covers the last OVERLAP bytes
    }
  } finally {
    await fh.close()
  }
  return [...found]
}

function claudePresetsFromIds(ids: string[]): ModelPreset[] {
  const models = ids
    .map((id) => {
      const m = id.match(/^claude-(fable|opus|sonnet|haiku)-(\d{1,2})(?:-(\d{1,2}))?$/)
      if (!m) return null
      // id dashes are dots: opus-5-5 → "5.5". Number() of that sorts fine.
      const display = m[3] ? `${m[2]}.${m[3]}` : m[2]
      return { id, family: m[1], display, version: Number(display) }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Current generations only — the binary also knows every legacy 3.x id.
    .filter((x) => x.version >= 4)
    .sort(
      (a, b) => b.version - a.version || FAMILY_RANK[a.family] - FAMILY_RANK[b.family]
    )
    // The CLI's own menu shows the newest few and tucks the rest behind
    // "+N models" — mirror that: 2 newest per family, Custom… covers the rest.
    .filter((x, _i, all) => all.filter((o) => o.family === x.family).indexOf(x) < 2)
  return models.map((x) => ({
    value: x.id,
    label: `${x.family.charAt(0).toUpperCase()}${x.family.slice(1)} ${x.display}`
  }))
}

interface ClaudeCatalogCache {
  binary: string
  mtimeMs: number
  size: number
  models: ModelPreset[]
}

function cachePath(): string {
  return join(app.getPath('appData'), 'claude-orchestrator', 'model-catalog.json')
}

async function claudeModels(): Promise<ModelPreset[]> {
  try {
    const binary = await findClaudeBinary()
    if (!binary) return MODEL_PRESETS
    const info = await stat(binary)

    let cache: ClaudeCatalogCache | null = null
    try {
      cache = JSON.parse(await readFile(cachePath(), 'utf-8')) as ClaudeCatalogCache
    } catch {
      // no cache yet
    }
    if (
      cache &&
      cache.binary === binary &&
      cache.mtimeMs === info.mtimeMs &&
      cache.size === info.size &&
      cache.models.length > 0
    ) {
      return [...cache.models, DEFAULT_ENTRY]
    }

    const models = claudePresetsFromIds(await scanClaudeBinary(binary))
    // A scan that finds almost nothing means the binary layout changed on us —
    // don't trust it over the curated fallback.
    if (models.length < 3) return MODEL_PRESETS

    const newCache: ClaudeCatalogCache = {
      binary,
      mtimeMs: info.mtimeMs,
      size: info.size,
      models
    }
    try {
      await writeFile(cachePath(), JSON.stringify(newCache, null, 2), 'utf-8')
    } catch {
      // cache write is best-effort
    }
    return [...models, DEFAULT_ENTRY]
  } catch {
    return MODEL_PRESETS
  }
}

// ---------------------------------------------------------------------------

/** The live model lists for both engines, falling back to the static presets
 *  whenever a source can't be read. */
export async function getModelCatalog(): Promise<ModelCatalog> {
  const [claude, codex] = await Promise.all([claudeModels(), codexModels()])
  return { claude, codex }
}

export function catalogForEngine(catalog: ModelCatalog, engine: AgentEngine): ModelPreset[] {
  return engine === 'codex' ? catalog.codex : catalog.claude
}
