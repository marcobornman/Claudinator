/**
 * Attention detection: classify a session's recent terminal output as
 * "waiting for a decision" vs "actively working". Lives in main so the
 * session's status is authoritative here (board dots, notifications, and the
 * upcoming remote server all consume it).
 */

// Claude Code draws interactive prompts with Ink, which wraps text in lots
// of ANSI escape codes — so we strip those before matching, otherwise the
// footer words get split up and literal substrings never match.
export function stripAnsi(s: string): string {
  return (
    s
      // CSI sequences: ESC [ … final byte (SGR colours, cursor moves, etc.)
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      // OSC sequences: ESC ] … (BEL | ST)
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // any other lone ESC-prefixed escape
      .replace(/\x1b[@-Z\\-_]/g, '')
  )
}

// The most reliable, glyph-independent signal is the navigation footer every
// arrow-select prompt prints, e.g. "Enter to select · ↑/↓ to navigate · Esc
// to cancel". Match "Esc to cancel" (a prompt) but NOT "esc to interrupt"
// (shown while Claude is actively generating).
const DECISION_RE = /to navigate|Enter to select|Esc to cancel|[❯›▶]\s*\d+\.|Do you want to (?:proceed|continue)/gi
// Signals that Claude is actively working: the interrupt hint, or the
// spinner timer "(40s · thinking)" it redraws while generating.
const RUNNING_RE = /esc to interrupt|\(\d+s\s*·/gi

function lastMatchIndex(t: string, re: RegExp): number {
  re.lastIndex = 0
  let pos = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    pos = m.index
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return pos
}

// A prompt is only "live" if its markers appear LATER in the stream than
// the most recent working signal. A dismissed or timed-out prompt (e.g.
// AskUserQuestion's "No response after 60s — continued") leaves its footer
// text in the tail while Claude keeps generating — newest signal wins.
export function isDecisionPrompt(raw: string): boolean {
  const t = stripAnsi(raw)
  const decisionPos = lastMatchIndex(t, DECISION_RE)
  if (decisionPos < 0) return false
  return decisionPos > lastMatchIndex(t, RUNNING_RE)
}
