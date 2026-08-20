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
