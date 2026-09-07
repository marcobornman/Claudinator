// Curated "What's New" entries shown after an update. Newest first.
// Keep in step with CHANGELOG.md when cutting a release.

export interface ReleaseNote {
  version: string
  date: string // YYYY-MM-DD
  summary?: string
  highlights: string[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.27',
    date: '2026-09-07',
    summary: 'Your markdown viewer now, and a context badge that believes in /compact.',
    highlights: [
      'Right-click any .md file in Windows → Open with → Claude Code Orchestrator: it opens straight into the preview popout — rendered markdown in your theme, no board. Already running? The file opens in the running app instantly. The refresh button re-reads from disk, so it doubles as a live view of a file Claude is editing.',
      'The session header\'s context badge updates the moment you /compact, instead of showing the old near-full number until the next reply.'
    ]
  },
  {
    version: '0.1.26',
    date: '2026-08-27',
    summary: 'Quieter openings: panes start collapsed, and the phone remote fits on arrival.',
    highlights: [
      'Opening a card gives the terminal the full width: the Files Changed panel starts collapsed (one click brings it back). Notes do the same — the CLI session still starts in the background, but its pane opens minimized.',
      'The phone remote opens sessions properly fitted instead of zoomed in — the initial fit used to run before the terminal had rendered and silently did nothing. The Fit/1:1 button now shows the mode you\'re in, not the one it switches to.'
    ]
  },
  {
    version: '0.1.25',
    date: '2026-08-20',
    summary: 'Plan usage at a glance, models per card, and a phone remote that scrolls.',
    highlights: [
      'Claude plan usage in the sidebar: a ring shows your 5-hour session window %, and clicking it breaks down every limit — Session, Weekly, and per-model weekly — with reset countdowns. Same numbers as the CLI\'s /usage, without leaving the board.',
      'Pick a model per card: New/Edit Card now has a Model dropdown — follow Settings (default) or pin this card to Fable 5, Opus 5, Opus 4.8, Sonnet, or Haiku for every session it starts.',
      'The phone remote\'s terminal got a working thumb: touch scrolling actually scrolls (and fills the whole screen instead of half), the board stays put underneath, Send reliably submits, and new ⌫ / copy buttons handle stranded input text and getting text off the terminal.',
      'Board dots tell the truth again: idle sessions no longer get stuck on the orange "needs a decision" pulse — the detector now understands the current CLI\'s rendering.'
    ]
  },
  {
    version: '0.1.24',
    date: '2026-08-14',
    summary: 'Time tracking that fills in your timesheet for you.',
    highlights: [
      'New Time tab (clock icon in the sidebar): your work time per card, tracked automatically from terminal activity — no timers to remember. A Mon–Sun week view grouped by Jira item, with history imported from your transcripts on first open, and CSV export ready for the business.',
      'Estimates included: terminal time undercounts real work, so gaps under an hour between activity on a card are bridged into a ~ estimate — the develop-and-read time between terminal touches, without counting lunch or overnight.',
      'Manual timers for the rest: meetings, testing, thinking. Start one from the Time tab; the sidebar clock glows in the accent color whenever time is recording.'
    ]
  },
  {
    version: '0.1.23',
    date: '2026-08-11',
    summary: 'Opus 5 arrives, and the CLI updater tells the truth.',
    highlights: [
      'Claude Opus 5 is in the model picker (Settings → General) and is now the default model for new installs.',
      'The CLI updater no longer pretends everything is fine when the update failed: if claude.exe is locked — every running session holds a lock, including your running cards — you now get told exactly that, instead of a bogus "you\'re on the latest version". Stop all sessions, then update.'
    ]
  },
  {
    version: '0.1.22',
    date: '2026-08-04',
    summary: 'Sessions that can’t get mixed up, in command-prompt colors.',
    highlights: [
      'Cards in the same folder can no longer swap conversations: new sessions launch with an app-generated session id, so the card is bound to its conversation with certainty — and the detector never adopts an id that belongs to another card. Resume forks and /clear are still tracked, now scoped to the right card.',
      'New look: the terminal uses the classic command-prompt (Windows Terminal "Campbell") colors, and the whole dark theme was restyled to match — neutral blacks and grays instead of the blue-tinted dark. Your own color overrides in the Theme Editor still apply on top.'
    ]
  },
  {
    version: '0.1.21',
    date: '2026-07-31',
    summary: 'Cards keep their own conversation, and worktrees follow the team standard.',
    highlights: [
      'Cards no longer get linked to the wrong conversation: agent (sidechain) transcripts are recognized and skipped by the session-id detector, and the id in the card header is now editable (pencil icon) — paste the right UUID or clear it to start fresh.',
      'New worktrees land in a shared features folder: <parent>\\features\\<feature>\\<RepoName>, so a feature spanning several repos keeps its worktrees together. Cleaning up a worktree removes the feature folder once it’s empty.',
      'The terminal no longer dims when it loses focus — the CLI’s own hollow outline cursor now shows the focus state, so the full-terminal fade was just noise.'
    ]
  },
  {
    version: '0.1.20',
    date: '2026-07-27',
    summary: 'Phone pairing works even with Hyper-V/WSL installed.',
    highlights: [
      'The pairing QR could point at a virtual network adapter (Hyper-V/WSL) that phones can never reach, showing "unavailable" no matter what. The pairing link now picks your real Wi-Fi/LAN address — virtual switches are sorted last and link-local addresses are skipped.'
    ]
  },
  {
    version: '0.1.19',
    date: '2026-07-27',
    summary: 'Phone remote polish and a more resilient CLI updater.',
    highlights: [
      'On your phone, you can now scroll up to read the scrollback while a session is working — streaming output no longer drags you back to the bottom unless you were already there.',
      'Home-screen app: the header no longer hides under the iPhone status bar, and the page always loads fresh after an update instead of a stale cached copy.',
      '"Check for CLI Updates" recovers from a stale proxy in the app\'s environment — if the registry looks unreachable it retries once with proxy settings stripped, so the button keeps working.'
    ]
  },
  {
    version: '0.1.18',
    date: '2026-07-20',
    summary: 'Phone remote, properly polished.',
    highlights: [
      'Fit-to-width terminal text is genuinely readable now — the squashed rendering was an iOS quirk in CSS zoom, so fit mode scales the real font size instead.',
      '"Add to Home Screen" works properly: the installed app authenticates on its own (no more Unauthorized screen), and if pairing is ever lost you can paste the pairing link right on the error screen.'
    ]
  },
  {
    version: '0.1.17',
    date: '2026-07-20',
    summary: 'The phone remote grows up.',
    highlights: [
      'Attach photos from your phone: the new 📷 button uploads a picture to your PC and drops its path into the CLI input, so Claude sees the image — screenshot something, attach it, ask away.',
      'Tap a column header on the phone to collapse it (remembered per phone). Collapsed columns still pulse orange if something inside needs a decision.',
      'Fit-to-width terminal text is actually readable now (an iOS font-inflation quirk squashed it), and the quick keys sit in two fixed rows instead of a scrolling strip.',
      'Dev-friendly: the remote server picks the next free port instead of failing when another instance already owns it.'
    ]
  },
  {
    version: '0.1.16',
    date: '2026-07-19',
    summary: 'Your board, on your phone.',
    highlights: [
      'Phone remote: enable it in Settings → Remote, scan the QR code, and your phone shows the live board — status dots update in real time and cards needing a decision float to the top.',
      'Tap a card with a running session for a live terminal view with quick keys (Esc, ⇧Tab, arrows, 1–3, y/n, Enter) and a prompt field. Answer permission prompts from the couch; the desktop terminal mirrors everything.',
      '"Add to Home Screen" on the phone gives you a proper Claudinator app icon and full-screen launch.',
      'Off by default, LAN-only, token-protected. Install Tailscale on your PC and phone to use it from anywhere.'
    ]
  },
  {
    version: '0.1.15',
    date: '2026-07-17',
    summary: 'Know when Claude needs you — without the noise.',
    highlights: [
      'Title-bar badges next to the window buttons count the sessions that need a decision (orange), are waiting for your prompt (green), or are working (blue). Click one for a dropdown of the card names — click a name to jump straight in.',
      'A subtle taskbar flash when a session needs attention while the app is in the background — stops the moment you focus the app. Toggle it in Settings → General; turn the toast notifications off there too if you prefer the nudge-only setup.'
    ]
  },
  {
    version: '0.1.14',
    date: '2026-07-13',
    summary: 'Smoother terminals.',
    highlights: [
      'Scrolling long sessions no longer gets stuck just above the bottom — and a floating ↓ button jumps you back down from anywhere in the scrollback.',
      'Shift+Esc closes the card view even while you’re typing in the terminal. Plain Esc stays with the CLI for interrupts and menus.',
      'The context badge now respects each model’s real context window (Haiku: 200k), so its percentage is meaningful on every model.',
      'Notes & Docs folders start minimized and auto-reveal when you create, move, or open something inside them.'
    ]
  },
  {
    version: '0.1.13',
    date: '2026-07-07',
    summary: 'Worktrees, full circle.',
    highlights: [
      'Merge back in one click — the branch menu merges your worktree branch into the main checkout, cleans up the worktree and branch, and drops your session back in the main repo. Dirty trees are refused safely and conflicts abort without leaving a mess.',
      'Deleting a card removes its worktree too (unless it has uncommitted work — that’s kept, with a heads-up).',
      'New worktrees can install their dependencies automatically (npm/yarn/pnpm, detected by lockfile).'
    ]
  },
  {
    version: '0.1.12',
    date: '2026-07-07',
    summary: 'Get pinged when Claude needs you, and see what each card costs.',
    highlights: [
      'Windows notifications when a session needs a decision or finishes while you’re elsewhere — click the toast to jump straight to that session. Toggles in Settings → General.',
      'Cards now show the estimated cost of their conversation (API list-price equivalent), with a live cost badge in the session view.',
      'Usage stats are now accurate: token and cost totals were over-counted ~2.5x and model pricing was stale — both fixed, so expect dashboard numbers to drop.',
      'Errors show as in-app toasts instead of blocking popups.'
    ]
  },
  {
    version: '0.1.11',
    date: '2026-07-07',
    summary: 'Run each card in its own git worktree.',
    highlights: [
      'The branch chip in the session view is now a dropdown — create a worktree on a new branch, open an existing branch as one, switch between worktrees, or hop back to the main checkout. Cards on the same repo can finally run sessions side by side without stepping on each other.',
      'Worktree-bound cards show a branch badge on the board, and the git panel follows whichever checkout the session runs in.',
      'The card’s conversation id now follows /clear and /new, so resume and the context badge never point at a dead conversation.'
    ]
  },
  {
    version: '0.1.10',
    date: '2026-07-07',
    summary: 'Terminal history survives closing a session.',
    highlights: [
      'Fixed reopening a session card showing only a fraction of the terminal history. The terminal is now kept alive (hidden) instead of being rebuilt from a lossy buffer, so your full scrollback is exactly as you left it.'
    ]
  },
  {
    version: '0.1.9',
    date: '2026-07-02',
    summary: 'Pick your model, and keep the CLI up to date.',
    highlights: [
      'New model picker in Settings → General — choose which Claude model every new session launches with (Fable 5, Opus 4.8, Sonnet, Haiku, or a custom id). Handy for switching off Fable 5 before it sunsets.',
      'Check for CLI updates from Settings → About — see the installed Claude Code CLI version and update it in place, without dropping to a terminal.'
    ]
  },
  {
    version: '0.1.8',
    date: '2026-06-23',
    summary: 'Terminal wrapping fix + popout preview refresh.',
    highlights: [
      'Fixed the terminal occasionally wrapping its output to ~2 characters wide — a hidden or not-yet-laid-out session tab could report a tiny width to the CLI. Terminals now only resize when properly visible.',
      'Added a refresh button to the detached Notes & Docs preview window (top-right) that reloads the note from disk — handy for picking up external edits, like a Claude session writing to the file.',
      'Press Ctrl+F in the detached preview to find text — every match is highlighted (the current one in orange) with a match count and Enter / Shift+Enter to step through.'
    ]
  },
  {
    version: '0.1.7',
    date: '2026-06-22',
    summary: 'Filter your usage by time range.',
    highlights: [
      'Usage Dashboard now has a time-range filter — Last 24 hours, 7 days, 30 days, 90 days, or All time (defaults to 7 days). Every chart and card reflects the window you pick.',
      'New auto-refresh control (Off / 30s / 1m / 5m / 15m, default 5 min). Both choices are remembered across restarts.',
      'Switching the range is instant — stats are scanned once and any window is derived from a cache, so it never re-reads your transcripts.'
    ]
  },
  {
    version: '0.1.6',
    date: '2026-06-18',
    summary: 'Organize your notes and read the board at a glance.',
    highlights: [
      'Notes & Docs now supports nested folders — organize your markdown in a drag-and-drop folder tree, with a right-click “Move to…” menu.',
      'Board cards show smarter status: green when Claude is waiting for your prompt, and a pulsing orange when it needs a decision (permission, plan, or menu choice).',
      'A “What’s New” popup (this one!) now appears after each update.',
      'Usage Dashboard polish: roomier cards, cleaner chart tooltips.'
    ]
  },
  {
    version: '0.1.5',
    date: '2026-06-18',
    summary: 'See your Claude Code usage at a glance.',
    highlights: [
      'New Usage Dashboard — click the token badge in the sidebar for charts of your usage: tokens over time, by model, by hour, and your most active projects.',
      'The sidebar token badge is now computed live from your sessions, so it always reflects the current day.'
    ]
  },
  {
    version: '0.1.4',
    date: '2026-06-12',
    summary: 'A proper app identity.',
    highlights: [
      'Custom application icon, embedded in the installer, taskbar, and sidebar.',
      'Publisher metadata added to the build.'
    ]
  },
  {
    version: '0.1.3',
    date: '2026-06-12',
    summary: 'Nicer note editing.',
    highlights: [
      'Pop the Notes & Docs preview out into its own movable window.',
      'Resizable divider between the markdown editor and the live preview.'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-05-27',
    summary: 'The first release.',
    highlights: [
      'Kanban board for managing Claude Code CLI sessions, with drag-and-drop, tags, search, and per-card terminals.'
    ]
  }
]
