# Changelog

All notable changes to Kodo are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.3.0] - 2026-03-04

### Added
- `.claude-plugin/plugin.json` manifest (v0.3.0, author, license, keywords)
- 5 agent definitions (`agents/`): code, architect, debug, review, security-audit
- 11 slash commands (`commands/`): status, plan, memory, audit, cost, health, mode, autonomy, stop, undo, ui
- 2 skills (`skills/`): kodo-context (auto-invoked), security-check (OWASP verification)
- `settings.json` with default agent (`code`) and tool permissions
- Comprehensive documentation: INSTALL, QUICKSTART, HOOKS, ARCHITECTURE, MEMORY, TROUBLESHOOTING
- SECURITY.md — OWASP coverage, threat model, encryption details
- CONTRIBUTING.md — conventions, testing, commit workflow
- `scripts/smoke-test.sh` — automated 12-check verification
- LICENSE (MIT)

### Changed
- `.gitignore` expanded with `/plans/library/`, `/rag-cache/`, `/modes/`
- README.md and CLAUDE.md updated with documentation links and plugin surface docs

## [0.2.0] - 2026-03-04

### Added
- Output guard module (ASI05) — scans LLM output for XSS, eval, SQL injection, destructive commands (11 patterns)
- UserPromptSubmit hook — scans user prompts for injection before Claude processes them
- PostToolUseFailure hook — logs tool failures to daily JSONL
- SessionStart hook — loads profile + memory context into Claude
- SessionEnd hook — session termination audit record
- Kill switch — `{ continue: false }` halts Claude entirely via behavioral baseline
- Importance-weighted memory decay — FadeMem-inspired `e^(-(t/S)^β)` with configurable importance
- Behavioral baseline with kill switch at 2x anomaly threshold
- Anti-leakage armor in system prompt (LLM07 defense)
- PostToolUse top-level `decision: "block"` format per official spec
- Type guard validation for MemCells (`isMemCell()`)
- All 9 hook payloads validated before processing (exit code 2 on failure)

### Changed
- Hook count 6 → 9 (added SessionStart, UserPromptSubmit, PostToolUseFailure)
- Stemmer rule order fixed (`-ation` before `-tion` for correct ordering)
- Baseline prunes stale events outside 5-minute window (bounded memory)

## [0.1.0] - 2026-03-03

### Added
- 51 source modules, 47 test files, 338 tests, 742 assertions
- Security kernel: vault (XChaCha20-Poly1305), policy, blocklist, injection scanner (44 markers, 7 categories), audit, circuit breaker, rate limiter, cost tracker, integrity
- Memory engine: MemCell, MemScene, BM25, Porter stemmer (14 rules), decay, profile, recall (RRF)
- Mode engine: 6 built-in modes (code, architect, ask, debug, plan, review) + custom YAML loader
- Planning: milestone planner, contextual hints, plan library with similarity search
- Context assembly: token budget (3K tokens), sanitizer, sufficiency checker
- RAG: NotebookLM connector (MCP/Python/API strategies), cache with BM25 fuzzy match
- Hooks: PreToolUse, PostToolUse, Stop, Notification, PreCompact, SessionEnd
- Web dashboard: localhost-only Bun HTTP server with HMAC-SHA256 auth
- CLI: 11 slash commands for status, mode, plan, memory, audit, cost, autonomy, stop, undo, ui, health
