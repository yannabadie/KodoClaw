# Changelog

All notable changes to Kodo are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.5.0] - 2026-03-04

### Fixed
- **CRITICAL**: Tool name case sensitivity — Claude Code sends PascalCase ("Bash", "Read") but security guards compared lowercase. All file guards and shell risk classification were bypassed. Fixed with `.toLowerCase()` normalization at hook entry point.
- Config path mismatch — `initKodo()` wrote `config.yaml` but `loadKodoConfig()` read `kodo.yaml`. Init config was silently ignored.
- RAG cache dropped source provenance — `CacheEntry` now stores `sources[]` from `groundingMetadata`. Cached responses retain their provenance.
- Decorative `permissions` block removed from `settings.json` (not read by any code).

### Added
- **Agent Foundation** — `src/agent/` module with AgentTemplate, KnowledgeBinding, AgentInstance types
- **AgentFactory** — creates instances from templates, generates Claude Code `--agents` JSON specs, writes `.md` agent files
- **Mode-to-template bridge** — `modeToTemplate()` converts existing BaseMode subclasses into AgentTemplates
- **Gemini File Search backend** — `src/rag/file-search.ts` with native `fetch()` to `generativelanguage.googleapis.com`, `file_search_store_names`, `metadataFilter` support
- **Connector `file_search` strategy** — new strategy option with per-mode store mapping via `geminiStores` config, circuit breaker integration
- **`/kodo:agent` command** — create, list, remove dynamic agents with knowledge bindings
- 5 built-in agent templates: code, architect, debug, review, security-audit

## [0.4.1] - 2026-03-04

### Added
- Hierarchical planning: milestones now support `subtasks[]`, `blockedBy[]` (DAG dependencies), and `priority`
- `addSubtask()`, `completeSubtask()`, `getUnblockedMilestones()`, `replan()` functions in planner
- Subtask progress display in contextual hints (`Subtasks: 2/5 done — Next: ...`)
- TF-IDF similarity scoring in milestone library (replaces word-overlap), searches goals too
- Task-driven memory recall: persists last user prompt, uses it as BM25 query on next SessionStart
- `persistLastPrompt()` function in UserPromptSubmit hook
- Unified `kodo.yaml` config loader (`src/config/loader.ts`) with priority: env vars > kodo.yaml > defaults
- `KodoConfig` interface combining RAG and cost configuration

### Changed
- `loadRAGConfig()` now delegates to `loadKodoConfig()` — actually reads kodo.yaml as documented
- Cost tracker can now be configured via `kodo.yaml` cost section
- SessionStart recall query is dynamic (last user prompt) instead of hardcoded "recent project context"
- 104 TypeScript files (54 src + 50 test), up from 102
- 430 tests, 905 expect() calls, up from 408 tests, 860 calls

### Fixed
- RAG config claimed "env vars > config.yaml > defaults" but never read config.yaml — now reads kodo.yaml
- Cost tracker defaults were hardcoded with no config file support — now wired via kodo.yaml

## [0.4.0] - 2026-03-04

### Added
- `src/memory/builder.ts` — Memory recall pipeline. `buildMemoryContext()` loads MemCells, builds BM25 index, applies decay-weighted scoring, returns formatted markdown
- Dual-strategy RAG connector: NotebookLM MCP (primary) + Gemini File Search (fallback) with dual circuit breakers
- Per-mode notebook binding: each custom YAML mode can reference a NotebookLM notebook via `notebook_id`
- `enrich()` and `deepResearch()` methods on RAG connector for agent self-improvement
- Session token TTL enforcement in `auth.ts` (default 24h, configurable `ttlMs`)
- Configurable `CostConfig` interface with `inputCostPerM`, `outputCostPerM`, `budgetUsd`
- `importance: Infinity` support in decay system — permanent memories that never decay

### Changed
- SessionStart hook now runs `buildMemoryContext()` recall pipeline instead of just counting cells
- Mode `extends` inheritance fully implemented: child YAML modes inherit parent's `allowedTools`, `autonomy`, `memory`, `planning`, `notebookId`
- Vault encryption: `vault.enc` now written with mode 0o600 (previously only `.vault_key` had restricted permissions)
- RAG connector rewritten with `ConnectorConfig` interface, backward-compatible with legacy `{ strategy: "none" }`
- Memory engine: 7 → 8 modules (added `builder.ts`)
- 100 TypeScript files (52 src + 48 test), up from 98
- 381 tests, 808 expect() calls, up from 338 tests, 742 calls
- Version unified across `package.json`, `src/index.ts`, `.claude-plugin/plugin.json`

### Fixed
- Mode `extends` was declared but ignored by loader — now fully functional
- Vault.enc file had no permission restriction — now 0o600
- Session tokens had no expiry — now enforce TTL

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
