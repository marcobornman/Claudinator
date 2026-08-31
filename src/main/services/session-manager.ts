import { v4 as uuid } from 'uuid'
import { SessionInfo, SessionStatus } from '@shared/models'
import { buildClaudeArgs } from './claude-cli'
import { isDecisionPrompt } from './attention'
import { timeTracker } from './time-tracker'
import { readFile, writeFile, readdir, stat, open } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { PAT } from './settings-persistence'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Context window per model family (as of 2026-07): Fable/Mythos, Opus 4.6+,
 * and Sonnet 4.6+/5 have 1M; Haiku and older-generation models have 200k.
 */
function contextLimitFor(model: string): number {
  const m = model.toLowerCase()
  if (m.includes('haiku')) return 200_000
  // Older generations before the 1M window
  if (m.includes('opus-4-5') || m.includes('opus-4-1') || m.includes('opus-4-0') || m.includes('3-opus')) return 200_000
  if (m.includes('sonnet-4-5') || m.includes('sonnet-4-0') || m.includes('3-5-sonnet') || m.includes('3-7-sonnet')) return 200_000
  return 1_000_000
}

const BUFFER_SIZE = 1024 * 1024 // 1MB ring buffer

// Dynamic import of node-pty - may fail if native module isn't compiled
let pty: typeof import('node-pty') | null = null
try {
  pty = require('node-pty')
} catch (e) {
  console.error('node-pty not available. Session spawning will fail.', e)
}

interface ManagedSession {
  info: SessionInfo
  ptyProcess: import('node-pty').IPty
  buffer: string
  dataListeners: Set<(data: string) => void>
  exitListeners: Set<(code: number | undefined) => void>
  claudeIdListeners: Set<(conversationId: string) => void>
  statusListeners: Set<(status: SessionStatus) => void>
  // Attention detection: after 3s of PTY silence, decide waiting vs decision.
  idleTimer?: ReturnType<typeof setTimeout>
  // Last PTY size (set by the desktop terminal) — remote viewers render at
  // the same grid so the screen replays correctly.
  cols: number
  rows: number
  // When the user manually set the conversation id, auto-detection may only
  // override it with files modified after this instant.
  manualIdAt?: number
  // Last time "/clear" appeared in THIS pty's output — /clear starts a brand
  // new conversation with no content link to the old one, so this is the only
  // signal tying the new file to this session rather than a neighbouring card.
  clearSeenAt?: number
}

class SessionManager {
  private sessions = new Map<string, ManagedSession>()
  // Global listeners (not per-session) — used by the remote server, which
  // exists before sessions do and must hear about all of them.
  private anyStatusListeners = new Set<(sessionId: string, status: SessionStatus) => void>()
  private anyResizeListeners = new Set<(sessionId: string, cols: number, rows: number) => void>()

  async start(
    cardId: string,
    cardTitle: string,
    projectDir: string,
    claudeSessionId?: string | null,
    rules?: string[],
    pats?: PAT[],
    claudeModel?: string
  ): Promise<SessionInfo> {
    if (!pty) {
      throw new Error(
        'node-pty is not available. Install the "Desktop development with C++" workload in Visual Studio, then run: npm run rebuild'
      )
    }

    const id = uuid()
    // Fresh sessions get an app-generated conversation id passed to the CLI
    // via --session-id, so the binding is certain from the first message —
    // cards sharing a folder can no longer adopt each other's conversations.
    // Resumes fork to a NEW id on the first message, so those still rely on
    // detection (which can prove the fork by content, see below).
    const launchId = claudeSessionId ? null : uuid()
    const info: SessionInfo = {
      id,
      cardId,
      projectDir,
      status: 'starting',
      claudeSessionId: claudeSessionId ?? launchId,
      pid: null
    }

    // Write CLAUDE.md if rules exist and projectDir is set
    if (rules && rules.length > 0 && projectDir) {
      const BEGIN_MARKER = '<!-- BEGIN Claude Orchestrator Rules -->'
      const END_MARKER = '<!-- END Claude Orchestrator Rules -->'
      const section =
        BEGIN_MARKER +
        '\n' +
        rules.map((r) => `- ${r}`).join('\n') +
        '\n' +
        END_MARKER

      const claudeMdPath = join(projectDir, 'CLAUDE.md')
      let existing = ''
      try {
        existing = await readFile(claudeMdPath, 'utf-8')
      } catch {
        // file doesn't exist yet
      }

      let newContent: string
      const beginIdx = existing.indexOf(BEGIN_MARKER)
      const endIdx = existing.indexOf(END_MARKER)
      if (beginIdx !== -1 && endIdx !== -1) {
        // Replace the existing section (inclusive of markers)
        newContent =
          existing.slice(0, beginIdx) +
          section +
          existing.slice(endIdx + END_MARKER.length)
      } else if (existing.trim().length > 0) {
        // Append to existing content
        newContent = existing.trimEnd() + '\n\n' + section + '\n'
      } else {
        newContent = section + '\n'
      }

      await writeFile(claudeMdPath, newContent, 'utf-8')
    }

    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
    // Strip Claude Code env vars so spawned sessions don't think they're nested
    const cleanEnv = { ...process.env } as Record<string, string>
    delete cleanEnv['CLAUDECODE']
    delete cleanEnv['CLAUDE_CODE']
    // Ensure CLI tools detect color support inside the PTY
    cleanEnv['FORCE_COLOR'] = '3'
    cleanEnv['TERM'] = 'xterm-256color'
    cleanEnv['COLORTERM'] = 'truecolor'

    // Inject PATs as environment variables
    if (pats && pats.length > 0) {
      for (const pat of pats) {
        const envName = 'PAT_' + pat.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
        cleanEnv[envName] = pat.value
      }
    }

    const ptyProcess = pty.spawn(shell, ['-NoLogo'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: projectDir || process.env.USERPROFILE || process.env.HOME || '.',
      env: cleanEnv,
      useConpty: false
    })

    info.pid = ptyProcess.pid
    info.status = 'running'

    const managed: ManagedSession = {
      info,
      ptyProcess,
      buffer: '',
      dataListeners: new Set(),
      exitListeners: new Set(),
      claudeIdListeners: new Set(),
      statusListeners: new Set(),
      cols: 120,
      rows: 30
    }

    ptyProcess.onData((data) => {
      // Append to ring buffer
      managed.buffer += data
      if (managed.buffer.length > BUFFER_SIZE) {
        managed.buffer = managed.buffer.slice(-BUFFER_SIZE)
      }
      // Notify listeners
      for (const listener of managed.dataListeners) {
        listener(data)
      }
      // The CLI redraws its input box per keystroke, so a typed "/clear" shows
      // up contiguously in the recent output. The ring buffer is append-only
      // (screen clears don't erase it), so a short tail window is enough.
      if (managed.buffer.slice(-300).includes('/clear')) {
        managed.clearSeenAt = Date.now()
      }
      // Time tracking: any PTY traffic (Claude streaming, and keystroke echoes
      // — the CLI redraws on input) counts as activity on this card.
      timeTracker.ping(cardId, cardTitle)
      this.detectAttention(managed)
    })

    ptyProcess.onExit(({ exitCode }) => {
      this.clearIdleTimer(managed)
      this.setStatus(managed, 'stopped')
      for (const listener of managed.exitListeners) {
        listener(exitCode)
      }
    })

    this.sessions.set(id, managed)

    // Send the claude command into the shell
    const claudeCmd = buildClaudeArgs(cardTitle, claudeSessionId, claudeModel, launchId)
    const startedAt = Date.now()
    ptyProcess.write(claudeCmd + '\r')

    // Detect the Claude conversation ID from the filesystem.
    // The .jsonl file is only created when the first message is sent, so we
    // poll while the session is alive. This also runs for RESUMED sessions:
    // `claude --resume` forks the conversation into a new file with a new id,
    // so the id we were handed goes stale on the first message — tracking the
    // newest file keeps the context badge live and the card's resume id
    // pointing at the latest state (same applies to /clear or /new mid-session).
    this.startClaudeIdDetection(id, projectDir, startedAt, launchId)

    return info
  }

  stop(sessionId: string): boolean {
    const managed = this.sessions.get(sessionId)
    if (!managed) return false
    try {
      managed.ptyProcess.kill()
    } catch {
      // already dead
    }
    this.clearIdleTimer(managed)
    this.setStatus(managed, 'stopped')
    return true
  }

  write(sessionId: string, data: string): void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return
    managed.ptyProcess.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return
    try {
      managed.ptyProcess.resize(cols, rows)
      managed.cols = cols
      managed.rows = rows
      for (const listener of this.anyResizeListeners) {
        listener(sessionId, cols, rows)
      }
    } catch {
      // ignore resize errors
    }
  }

  getDims(sessionId: string): { cols: number; rows: number } {
    const managed = this.sessions.get(sessionId)
    return { cols: managed?.cols ?? 120, rows: managed?.rows ?? 30 }
  }

  getBuffer(sessionId: string): string {
    return this.sessions.get(sessionId)?.buffer ?? ''
  }

  getInfo(sessionId: string): SessionInfo | null {
    return this.sessions.get(sessionId)?.info ?? null
  }

  onData(sessionId: string, listener: (data: string) => void): () => void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return () => {}
    managed.dataListeners.add(listener)
    return () => managed.dataListeners.delete(listener)
  }

  onExit(sessionId: string, listener: (code: number | undefined) => void): () => void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return () => {}
    managed.exitListeners.add(listener)
    return () => managed.exitListeners.delete(listener)
  }

  onClaudeId(sessionId: string, listener: (conversationId: string) => void): () => void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return () => {}
    // If already detected, fire immediately — but still subscribe: the id can
    // change again while the session runs (resume forks, /clear, /new).
    if (managed.info.claudeSessionId) {
      listener(managed.info.claudeSessionId)
    }
    managed.claudeIdListeners.add(listener)
    return () => managed.claudeIdListeners.delete(listener)
  }

  /** Manual override from the UI — used when auto-detection latched onto the
   *  wrong conversation (e.g. an agent transcript). Detection only overrides
   *  this again with files that show activity after the edit. */
  setClaudeSessionId(sessionId: string, claudeId: string | null): void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return
    managed.manualIdAt = Date.now()
    managed.info.claudeSessionId = claudeId
    if (claudeId) {
      for (const listener of managed.claudeIdListeners) {
        listener(claudeId)
      }
    }
  }

  onStatus(sessionId: string, listener: (status: SessionStatus) => void): () => void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return () => {}
    managed.statusListeners.add(listener)
    return () => managed.statusListeners.delete(listener)
  }

  onAnyStatus(listener: (sessionId: string, status: SessionStatus) => void): () => void {
    this.anyStatusListeners.add(listener)
    return () => this.anyStatusListeners.delete(listener)
  }

  onAnyResize(listener: (sessionId: string, cols: number, rows: number) => void): () => void {
    this.anyResizeListeners.add(listener)
    return () => this.anyResizeListeners.delete(listener)
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.info)
  }

  killAll(): void {
    for (const managed of this.sessions.values()) {
      try {
        managed.ptyProcess.kill()
      } catch {
        // ignore
      }
    }
    this.sessions.clear()
  }

  getCwd(sessionId: string): string | null {
    return this.parseCwdFromBuffer(sessionId)
  }

  async getContextInfo(sessionId: string): Promise<string | null> {
    const managed = this.sessions.get(sessionId)
    if (!managed) return null
    const claudeId = managed.info.claudeSessionId
    const projectDir = managed.info.projectDir
    if (!claudeId || !projectDir) return null

    try {
      const projectKey = projectDir.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+$/, '')
      const jsonlPath = join(homedir(), '.claude', 'projects', projectKey, claudeId + '.jsonl')
      const content = await readFile(jsonlPath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim())

      const format = (tokens: number, model: string): string => {
        const pct = Math.round((tokens / contextLimitFor(model)) * 100)
        if (tokens >= 1000) {
          const k = (tokens / 1000).toFixed(1).replace(/\.0$/, '')
          return `${pct}% (${k}k)`
        }
        return `${pct}% (${tokens})`
      }

      // Scan backward for the freshest context signal: an assistant reply's
      // usage, or a compact boundary — /compact writes no assistant message,
      // so its postTokens is the only record of the shrunken context until
      // the next reply lands.
      let pendingCompactTokens: number | null = null
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i])
          const postTokens = entry?.compactMetadata?.postTokens
          if (entry?.subtype === 'compact_boundary' && typeof postTokens === 'number') {
            // The context limit depends on the model, which only assistant
            // messages carry — keep scanning back for one.
            pendingCompactTokens = postTokens
            continue
          }
          const usage = entry?.message?.usage
          if (usage && entry?.message?.role === 'assistant') {
            const model = entry?.message?.model ?? ''
            if (pendingCompactTokens !== null) return format(pendingCompactTokens, model)
            const inputTokens = (usage.input_tokens ?? 0)
              + (usage.cache_creation_input_tokens ?? 0)
              + (usage.cache_read_input_tokens ?? 0)
            return format(inputTokens, model)
          }
        } catch {
          continue
        }
      }
      if (pendingCompactTokens !== null) return format(pendingCompactTokens, '')
    } catch {
      // file doesn't exist yet or can't be read
    }
    return null
  }

  private startClaudeIdDetection(
    sessionId: string,
    projectDir: string,
    startedAfter: number,
    launchId: string | null
  ): void {
    // Claude Code stores conversations in ~/.claude/projects/<encoded-path>/
    // The path encoding replaces non-alphanumeric chars (except -) with -
    const projectKey = projectDir.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+$/, '')
    const claudeProjectDir = join(homedir(), '.claude', 'projects', projectKey)
    const pollIntervalMs = 5000

    // Agent (sidechain) transcripts land in the same folder as the main
    // conversation and can be the newest file — adopting one links the card
    // to an agent's conversation. Classify each file once by its first line.
    const sidechainCache = new Map<string, boolean>()
    const isSidechainFile = async (filePath: string, id: string): Promise<boolean> => {
      const cached = sidechainCache.get(id)
      if (cached !== undefined) return cached
      try {
        const fh = await open(filePath, 'r')
        try {
          const buf = Buffer.alloc(4096)
          const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
          if (bytesRead === 0) return false // nothing written yet — retry next poll
          const firstLine = buf.toString('utf-8', 0, bytesRead).split('\n', 1)[0]
          const sidechain = /"isSidechain"\s*:\s*true/.test(firstLine)
          sidechainCache.set(id, sidechain)
          return sidechain
        } finally {
          await fh.close()
        }
      } catch {
        return false // unreadable — assume main conversation
      }
    }

    // A resume forks the conversation: the new file starts with the copied
    // history, whose entries still carry the ORIGINAL session id — so a fork
    // of OUR conversation can be proven by content. Only positives are cached;
    // a file caught mid-copy may not contain the id yet.
    const forkLinkCache = new Set<string>()
    const isForkOf = async (filePath: string, id: string, parentId: string): Promise<boolean> => {
      const key = `${id}:${parentId}`
      if (forkLinkCache.has(key)) return true
      try {
        const fh = await open(filePath, 'r')
        try {
          const buf = Buffer.alloc(256 * 1024)
          const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
          if (bytesRead > 0 && buf.toString('utf-8', 0, bytesRead).includes(parentId)) {
            forkLinkCache.add(key)
            return true
          }
          return false
        } finally {
          await fh.close()
        }
      } catch {
        return false
      }
    }

    const poll = async (): Promise<void> => {
      const managed = this.sessions.get(sessionId)
      if (!managed || managed.info.status === 'stopped') return

      try {
        const files = await readdir(claudeProjectDir)
        const candidates: { id: string; path: string; mtime: number }[] = []

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue
          const id = file.slice(0, -6)
          if (!UUID_RE.test(id)) continue

          const filePath = join(claudeProjectDir, file)
          try {
            const fileStat = await stat(filePath)
            // Respect a manual edit: only files active after it may take over.
            if (fileStat.mtimeMs >= startedAfter && fileStat.mtimeMs > (managed.manualIdAt ?? 0)) {
              candidates.push({ id, path: filePath, mtime: fileStat.mtimeMs })
            }
          } catch {
            continue
          }
        }

        // Ids owned by other live sessions: every card in this folder scans
        // the same directory, so never adopt a neighbour's conversation.
        const claimed = new Set<string>()
        for (const [otherId, other] of this.sessions) {
          if (otherId === sessionId || other.info.status === 'stopped') continue
          if (other.info.claudeSessionId) claimed.add(other.info.claudeSessionId)
        }

        const currentId = managed.info.claudeSessionId
        // A --session-id launch is bound before its file exists — a missing
        // file there means "no message yet", not "conversation vanished".
        const currentFileMissing =
          currentId !== null &&
          currentId !== launchId &&
          !files.includes(currentId + '.jsonl')
        const clearWindow =
          managed.clearSeenAt !== undefined && Date.now() - managed.clearSeenAt < 3 * 60_000

        // Adopt a different file only when it's provably (or plausibly) OURS:
        // no binding yet / our file vanished (bad resume id → user picked from
        // the CLI list), a content-proven fork of our conversation (resume),
        // or a fresh file right after /clear in this pty.
        candidates.sort((a, b) => b.mtime - a.mtime)
        for (const candidate of candidates) {
          if (candidate.id === currentId) break // newest activity is already ours
          if (claimed.has(candidate.id)) continue
          if (await isSidechainFile(candidate.path, candidate.id)) continue

          const adoptable =
            !currentId ||
            currentFileMissing ||
            (clearWindow && candidate.mtime >= (managed.clearSeenAt ?? 0) - 10_000) ||
            (await isForkOf(candidate.path, candidate.id, currentId))
          if (!adoptable) continue

          managed.info.claudeSessionId = candidate.id
          for (const listener of managed.claudeIdListeners) {
            listener(candidate.id)
          }
          break
        }
      } catch {
        // directory may not exist yet
      }

      const m = this.sessions.get(sessionId)
      if (m && m.info.status !== 'stopped') {
        setTimeout(poll, pollIntervalMs)
      }
    }

    setTimeout(poll, 3000)
  }

  private parseCwdFromBuffer(sessionId: string): string | null {
    const managed = this.sessions.get(sessionId)
    if (!managed) return null

    const buffer = managed.buffer
    // Look for common shell prompt patterns that include the path, scanning from the end
    const lines = buffer.split('\n')

    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
      const line = lines[i].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim() // strip ANSI

      // PowerShell prompt: PS C:\path\to\dir>
      const psMatch = line.match(/^PS\s+([A-Za-z]:\\[^>]*?)>/)
      if (psMatch) return psMatch[1]

      // cmd prompt: C:\path\to\dir>
      const cmdMatch = line.match(/^([A-Za-z]:\\[^>]*?)>/)
      if (cmdMatch) return cmdMatch[1]

      // bash/zsh prompt with path (user@host:/path/to/dir$ or ~/dir$)
      const bashMatch = line.match(/:([/~][^\$#]*?)\s*[\$#]\s*$/)
      if (bashMatch) return bashMatch[1]
    }

    return null
  }

  remove(sessionId: string): void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return
    try {
      managed.ptyProcess.kill()
    } catch {
      // ignore
    }
    this.clearIdleTimer(managed)
    this.sessions.delete(sessionId)
  }

  private setStatus(managed: ManagedSession, status: SessionStatus): void {
    if (managed.info.status === status) return
    managed.info.status = status
    for (const listener of managed.statusListeners) {
      listener(status)
    }
    for (const listener of this.anyStatusListeners) {
      listener(managed.info.id, status)
    }
  }

  private clearIdleTimer(managed: ManagedSession): void {
    if (managed.idleTimer) {
      clearTimeout(managed.idleTimer)
      managed.idleTimer = undefined
    }
  }

  // Classify the session on every chunk of PTY output: a decision prompt on
  // screen flags immediately (bounded tail so a resolved prompt clears as soon
  // as enough new output scrolls in); otherwise output flowing means running,
  // and after 3s of quiet we decide between decision and waiting.
  private detectAttention(managed: ManagedSession): void {
    if (managed.info.status === 'stopped') return

    if (isDecisionPrompt(managed.buffer.slice(-1200))) {
      this.clearIdleTimer(managed)
      this.setStatus(managed, 'decision')
      return
    }

    this.setStatus(managed, 'running')

    this.clearIdleTimer(managed)
    managed.idleTimer = setTimeout(() => {
      managed.idleTimer = undefined
      if (managed.info.status === 'stopped') return
      const next = isDecisionPrompt(managed.buffer.slice(-3000)) ? 'decision' : 'waiting'
      this.setStatus(managed, next)
    }, 3000)
  }
}

export const sessionManager = new SessionManager()
