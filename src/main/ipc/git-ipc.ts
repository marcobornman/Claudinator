import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { IPC } from '@shared/ipc-channels'
import { sessionManager } from '../services/session-manager'

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        // git diff returns exit code 1 when there are differences — that's fine
        if (err.code === 1 && args[0] === 'diff') {
          resolve(stdout)
          return
        }
        reject(new Error(stderr || err.message))
        return
      }
      resolve(stdout)
    })
  })
}

/**
 * Find the git root for a directory by running `git rev-parse --show-toplevel`.
 * Returns null if the directory is not inside a git repo.
 */
async function findGitRoot(dir: string): Promise<string | null> {
  try {
    const root = (await runGit(['rev-parse', '--show-toplevel'], dir)).trim()
    return root || null
  } catch {
    return null
  }
}

/**
 * Resolve the git root for a given project dir + session context.
 * 1. Try session CWD (parsed from terminal buffer) — most accurate
 * 2. Fall back to the card's projectDir itself
 */
async function resolveGitRoot(projectDir: string, sessionId?: string): Promise<string> {
  // Try session CWD first — reflects where Claude CLI actually cd'd to
  if (sessionId) {
    const sessionCwd = sessionManager.getCwd(sessionId)
    if (sessionCwd) {
      const root = await findGitRoot(sessionCwd)
      if (root) return root
    }
  }

  // Fall back to projectDir
  const root = await findGitRoot(projectDir)
  if (root) return root

  throw new Error('Not a git repository')
}

export function registerGitIpc(): void {
  // Cache resolved git root per projectDir+sessionId
  const gitRootCache = new Map<string, string>()

  ipcMain.handle(
    IPC.GIT_STATUS,
    async (
      _event,
      projectDir: string,
      sessionId?: string
    ): Promise<{ branch: string; files: { path: string; status: string }[] }> => {
      // Always re-resolve when we have a sessionId (CWD can change as CLI runs)
      // Only cache for bare projectDir lookups (no session context)
      let gitRoot: string
      if (sessionId) {
        gitRoot = await resolveGitRoot(projectDir, sessionId)
        gitRootCache.set(projectDir, gitRoot)
      } else {
        gitRoot = gitRootCache.get(projectDir) ?? await resolveGitRoot(projectDir)
        gitRootCache.set(projectDir, gitRoot)
      }

      try {
        const [branchOut, statusOut] = await Promise.all([
          runGit(['-C', gitRoot, 'branch', '--show-current'], gitRoot),
          runGit(['-C', gitRoot, 'status', '--porcelain=v1'], gitRoot)
        ])

        const branch = branchOut.trim()
        const files = statusOut
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => ({
            status: line.substring(0, 2).trim(),
            path: line.substring(3)
          }))

        return { branch, files }
      } catch {
        // Cached root may be stale — clear and retry once
        gitRootCache.delete(projectDir)
        const freshRoot = await resolveGitRoot(projectDir, sessionId)
        gitRootCache.set(projectDir, freshRoot)

        const [branchOut, statusOut] = await Promise.all([
          runGit(['-C', freshRoot, 'branch', '--show-current'], freshRoot),
          runGit(['-C', freshRoot, 'status', '--porcelain=v1'], freshRoot)
        ])

        const branch = branchOut.trim()
        const files = statusOut
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => ({
            status: line.substring(0, 2).trim(),
            path: line.substring(3)
          }))

        return { branch, files }
      }
    }
  )

  ipcMain.handle(
    IPC.GIT_DIFF,
    async (_event, projectDir: string, filePath: string): Promise<string> => {
      const gitRoot = gitRootCache.get(projectDir) ?? projectDir

      // Try unstaged diff first, fall back to staged diff
      const unstaged = await runGit(['-C', gitRoot, 'diff', '--', filePath], gitRoot)
      if (unstaged.trim()) return unstaged

      const staged = await runGit(['-C', gitRoot, 'diff', '--cached', '--', filePath], gitRoot)
      if (staged.trim()) return staged

      // For untracked files, show full file content as added
      try {
        const content = await runGit(['-C', gitRoot, 'show', `:${filePath}`], gitRoot)
        return content
      } catch {
        return ''
      }
    }
  )
}
