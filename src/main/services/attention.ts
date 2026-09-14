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
// to cancel". Ink positions words with cursor moves, so after stripping ANSI
// the spaces between words are often simply gone ("Esctocancel") — every
// phrase must match with the spaces optional. The numbered-option marker
// requires a letter after "N." because interleaved repaint fragments can put
// the idle input caret next to unrelated digits ("❯0.1." from a version
// string) — real options start with words ("❯1.Yes").
const DECISION_RE = /to\s*navigate|Enter\s*to\s*(?:select|confirm)|Esc\s*to\s*cancel|[❯›▶]\s*\d+\.\s*[A-Za-z]|Do\s*you\s*want\s*to\s*(?:proceed|continue)/gi
// Signals that Claude is working or has just finished: the spinner timer
// "(40s · ↓ 1 tokens)" redrawn while generating, the end-of-turn summary the
// CLI leaves in the scrollback ("✻ Baked for 2s"), and the legacy interrupt
// hint. The end-of-turn marker matters most: it lands after any prompt that
// was answered during the turn, so a stale prompt can't stay "newest".
const RUNNING_RE = /esc\s*to\s*interrupt|\(\d+s\s*·|[✻✶✽✢·*]\s*\w+\s*for\s*\d+s\b/gi

// Codex TUI (captured empirically from codex 0.153.4 under ConPTY):
// menus (update, trust-folder, command approval) all end with "Press enter to
// confirm/continue" and list numbered options behind a "›" marker; the
// approval prompt opens with "Would you like to run the following command?".
// The working footer is "• Working (3s • esc to interrupt)" — bullet •, not
// Claude's middle dot — redrawn constantly while generating, so its last
// occurrence lands after any prompt text that was answered during the turn.
const CODEX_DECISION_RE = /Would\s*you\s*like\s*to\s*run|Press\s*enter\s*to\s*(?:confirm|continue)|Do\s*you\s*trust|[❯›▶]\s*\d+\.\s*[A-Za-z]/gi
const CODEX_RUNNING_RE = /esc\s*to\s*interrupt|\(\d+s\s*[·•]|•\s*W?orking\b/gi

// While a command-approval modal is pending, codex floods the terminal title
// (OSC 0) with "[ ! ] Action Required" ~2×/s — which both proves a decision is
// pending and, because the flood dominates the buffer tail, ages the modal's
// text out of the stripped window. While generating, the title is a braille
// spinner + "work". These match against the RAW buffer (OSC is otherwise
// stripped), and the title channel wins whenever it has the newer signal.
// Startup menus (update, trust-folder) set no titles — text patterns cover
// those.
const CODEX_TITLE_DECISION_RE = /\]0;\[ [!.] \] Action Required/g
const CODEX_TITLE_RUNNING_RE = /\]0;[⠀-⣿] work\x07/g

export type AttentionEngine = 'claude' | 'codex'

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
export function isDecisionPrompt(raw: string, engine: AttentionEngine = 'claude'): boolean {
  if (engine === 'codex') {
    // Title channel first: a pending approval modal floods "Action Required".
    const titleDecision = lastMatchIndex(raw, CODEX_TITLE_DECISION_RE)
    const titleRunning = lastMatchIndex(raw, CODEX_TITLE_RUNNING_RE)
    if (titleDecision >= 0 && titleDecision > titleRunning) return true
  }
  const t = stripAnsi(raw)
  const decisionRe = engine === 'codex' ? CODEX_DECISION_RE : DECISION_RE
  const runningRe = engine === 'codex' ? CODEX_RUNNING_RE : RUNNING_RE
  const decisionPos = lastMatchIndex(t, decisionRe)
  if (decisionPos < 0) return false
  return decisionPos > lastMatchIndex(t, runningRe)
}
