# Changelog

All notable changes to Claude Code Orchestrator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-05-27

### Added
- Kanban board with 5 columns (Backlog, In Progress, Review, Validating, Complete)
- Drag-and-drop card reordering with dnd-kit
- Card tags, search, and filtering
- Integrated xterm.js terminals for Claude Code CLI sessions
- Session status tracking (starting, running, waiting, stopped, error)
- Claude conversation ID tracking for session resume
- Git status and diff panel per session
- Dark and light themes with full CSS variable customization
- Custom theme creation, import, and export
- Personal access token (PAT) management with env injection
- Rules management (applied via CLAUDE.md)
- Settings persistence across restarts
- About tab with version display and update checker
- Auto-update via GitHub Releases (electron-updater)
- Windows NSIS installer packaging
