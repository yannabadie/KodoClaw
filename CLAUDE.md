# Kodo — AI Instructions

## Project overview
Kodo is a Claude Code plugin providing intelligent memory, hierarchical
planning, security, and NotebookLM RAG integration.
116 TypeScript files (60 src + 56 test), ~9.5K LOC, Bun runtime.

## Plugin surface

### Manifest
`.claude-plugin/plugin.json` — name, version (0.5.0), author, license, keywords.

### Agents (5)
Markdown files in `agents/` with YAML frontmatter (`name`, `description`) + system prompt.

| Agent | Autonomy | Tools | Use case |
|-------|----------|-------|----------|
| `code` (default) | trusted | full | General coding |
| `architect` | supervised | read-only | System design |
| `debug` | trusted | full | Debugging |
| `review` | guarded | read-only | Code review, OWASP |
| `security-audit` | supervised | read-only | Security audit |

### Slash commands (11)
Markdown files in `commands/` invoked as `/kodo:<name>`.

| Command | Description |
|---------|-------------|
| `status` | Mode, autonomy, memory count, plan, cost |
| `plan` | Milestone roadmap (show/create/complete) |
| `memory` | MemCells, MemScenes, profile summary |
| `audit` | Recent audit log entries |
| `cost` | Token usage, USD cost, budget |
| `health` | Subsystem health checks |
| `mode` | Switch active mode |
| `autonomy` | Change autonomy level |
| `stop` | Emergency kill-switch |
| `undo` | Git snapshot rollback |
| `ui` | Web dashboard launcher |

### Skills (2)
- `skills/kodo-context/SKILL.md` — Auto-invoked context about Kodo commands and configuration
- `skills/security-check/SKILL.md` — OWASP compliance and security pattern verification

### Settings
`settings.json` — default agent (`code`), tool permissions.

## Architecture
```
Plugin Surface (9 hooks, 5 agents, 11 commands, 2 skills)
    |
    v
Mode Engine  <-->  Memory Engine  <-->  Policy Kernel
    |                   |                    |
 Planner          BM25 + MemCells      Audit + Vault
    |                   |                    |
  Library         Stemmer + RRF       Circuit Breaker
                        |              Rate Limiter
                    Decay            Cost Tracker
                    Profile          Output Guard
                                     Integrity
                                     Baseline
```

9 hooks registered in `hooks/hooks.json` (official nested plugin format):
PreToolUse, PostToolUse, PostToolUseFailure, Stop, Notification,
PreCompact, SessionStart, UserPromptSubmit, SessionEnd.

All hooks use `${CLAUDE_PLUGIN_ROOT}` for portable paths.
All hooks read JSON from stdin, write JSON to stdout via `src/hooks/cli.ts`.
CLI accepts both official spec fields (`tool_name`/`tool_input`/`session_id`) and
legacy fields (`tool`/`params`/`sessionId`) for backward compatibility.

Hook output formats per event type:
- PreToolUse: `hookSpecificOutput` with `permissionDecision: "allow"|"deny"|"ask"`
- PostToolUse: top-level `decision: "block"` + `reason`, or `hookSpecificOutput` with `additionalContext`
- SessionStart: `hookSpecificOutput` with `additionalContext`
- UserPromptSubmit: top-level `decision: "block"` + `reason`
- Kill switch: `{ continue: false, stopReason: "..." }` halts Claude entirely

## Conventions
- TypeScript strict, no `any`
- Biome for lint+format: tabs, 100 char line width, recommended rules
- `bun run check` before commit (zero errors required)
- `bun test` before commit (525 tests, 1119 expect() calls, zero failures)
- Naming: camelCase functions/vars, PascalCase types/classes
- Files: kebab-case.ts
- One export per file preferred
- No default exports
- Await all promises that do I/O (no fire-and-forget writes)
- All hook payloads MUST be validated before processing (exit 2 on failure)
- All JSON deserialized from disk MUST be validated with type guards

## File structure

### src/security/ — Policy kernel (11 modules)
- `vault.ts` — XChaCha20-Poly1305 encrypted secret store. Atomic write-then-rename. Key file AND vault.enc restricted to mode 0o600.
- `policy.ts` — Shell risk classifier (low/medium/high/critical) + autonomy policy matrix. Covers python -c, node -e, docker run, PowerShell -enc, eval(), exec(). Exports `classifyShellRisk()`, `shouldConfirm()`.
- `blocklist.ts` — Sensitive path blocking (`.env`, `.ssh/*`, credentials). Content redaction preserving original regex flags. Exports `isSensitivePath()`, `isConfidentialContent()`, `redactConfidential()`.
- `injection.ts` — Aho-Corasick O(n) multi-pattern scanner with 44 markers across 7 categories: role override, identity swap, system prompt, instruction override, social engineering, roleplay, prompt extraction (LLM07). Unicode homoglyph normalization (Cyrillic→Latin). Zero-width character stripping.
- `output-guard.ts` — Scans LLM output for 17 dangerous patterns: XSS (script tags, javascript: URIs, event handlers), code execution (eval, Function, import, child_process), SQL injection (DROP TABLE, DELETE FROM, UNION SELECT), destructive commands (rm -rf /), system prompt leakage (SYSTEM: You are, System prompt:), instruction leakage, credential exposure (API_KEY=, Bearer JWT, password/secret/token). Covers OWASP ASI05 + LLM05 + LLM07.
- `audit.ts` — Append-only JSONL log, one file per day. Exports `AuditLog` class.
- `baseline.ts` — Behavioral anomaly detection. Tracks tool call frequency, injection attempts, sensitive access. Prunes stale events outside 5-minute window. Kill switch at 2x threshold (`shouldTerminate`).
- `circuit-breaker.ts` — closed→open→half_open states. Prevents cascading failures. Wired into RAG connector.
- `cost-tracker.ts` — Token usage tracking with USD budget enforcement. Configurable `CostConfig` with `inputCostPerM`/`outputCostPerM`/`budgetUsd`. Backward-compatible constructor accepts `CostConfig | number`.
- `rate-limiter.ts` — Sliding window rate limiter for tool calls.
- `integrity.ts` — SHA-256 manifest for skill file verification.

### src/memory/ — Memory engine (8 modules)
- `memcell.ts` — Episodic memory unit with optional `importance` field (0.0-1.0+, default 1.0). SHA-256 checksums for tamper detection. Injection scanning on write (blocks score >= 4). `isMemCell()` type guard validates JSON before loading. Exports `createMemCell()`, `loadMemCells()`, `computeChecksum()`, `verifyChecksum()`.
- `memscene.ts` — Scene clustering via Jaccard similarity (threshold 0.3). Crypto-safe IDs (`randomUUID`). Exports `consolidate()`, `loadMemScenes()`.
- `profile.ts` — User traits (stable) + temporary states (expiring ISO date). `getTemporaryStates()` filters expired entries. `renderContext()` is non-mutating (does not call `purgeExpired()`). Exports `UserProfile` class.
- `recall.ts` — Cosine similarity, Reciprocal Rank Fusion (k=60), TF-IDF vectorization. `applyDecayToScores()` multiplies BM25 scores by retention factors. No external deps.
- `bm25.ts` — Full-text search using BM25 ranking (k1=1.5, b=0.75). Serializable index. Integrates stemmer + stop words.
- `stemmer.ts` — Simplified Porter stemmer (14 suffix rules, `-ation` before `-tion` for correct ordering) + 88 English stop words.
- `decay.ts` — FadeMem-inspired importance-weighted decay. `retention(t) = e^(-(t/S)^β)` where S = importance * 7 days, β = 0.8 (sub-linear). Prune threshold 10%. `importance: Infinity` → retention always 1.0 (permanent memories). Exports `computeRetention()`, `applyDecay()`, `pruneDecayed()`.
- `builder.ts` — Memory recall pipeline. `buildMemoryContext(cellsDir, query, topK)` loads cells, builds BM25 index, searches, applies decay-weighted scoring, returns formatted markdown. Wired into session-start hook.

### src/modes/ — Mode engine (9 modules)
- `base-mode.ts` — Abstract `BaseMode` class. Properties: `name`, `slug`, `instructions`, `allowedTools`, `autonomyLevel`, `memoryDepth`, `planningEnabled`.
- `detector.ts` — Heuristic mode detection from user message keywords. Returns `BuiltInSlug`.
- `loader.ts` — Load custom modes from YAML files. Validates `autonomy` against allowed values. Rejects slugs that conflict with built-ins (code, architect, ask, debug, plan, review). Implements `extends` inheritance: child YAML modes inherit parent's `allowedTools`, `autonomy`, `memory`, `planning`, `notebookId` via `getBuiltInBySlug()` helper. Child properties override parent defaults.
- `built-in/code.ts` — CodeMode: trusted, full tools, planning enabled.
- `built-in/architect.ts` — ArchitectMode: supervised, read-only, full memory.
- `built-in/ask.ts` — AskMode: guarded, read-only, no planning.
- `built-in/debug.ts` — DebugMode: trusted, full tools, full memory.
- `built-in/plan.ts` — PlanMode: guarded, read-only, planning enabled.
- `built-in/review.ts` — ReviewMode: guarded, read-only, no planning.

### src/planning/ — Planning (3 modules)
- `planner.ts` — Hierarchical milestone-based plans with DAG dependencies. Exports `createPlan()`, `getActiveMilestone()`, `updateMilestone()`, `isPlanComplete()`, `renderPlanContext()`, `addSubtask()`, `completeSubtask()`, `getUnblockedMilestones()`, `replan()`. Milestones support `subtasks[]`, `blockedBy[]`, `priority`.
- `hints.ts` — Contextual step hints based on milestone + last action/error + subtask progress.
- `library.ts` — Archive/retrieve past plans. Per-file error handling (skips corrupt JSON). TF-IDF similarity search over task + goals.

### src/context/ — System prompt assembly (3 modules)
- `assembler.ts` — 6-step pipeline with token budget (3000 tokens = 12K chars). Truncates with priority order. Appends anti-leakage armor suffix (LLM07 defense).
- `sanitizer.ts` — Injection scan + confidential content redaction. Wraps output in delimiters.
- `sufficiency.ts` — Context completeness check + query expansion for short queries.

### src/agent/ — Agent foundation (5 modules)
- `template.ts` — `AgentTemplate` interface with 5 built-in templates (code, architect, debug, review, security-audit). Type guard `isValidTemplate()`. Maps to Claude Code native agent spec fields.
- `binding.ts` — `KnowledgeBinding` interface (backend: file_search/notebooklm/none, resourceId, metadataFilter, topK, citationPolicy, ttlMs). Factory `createBinding()`. Type guard `isValidBinding()`.
- `instance.ts` — `AgentInstance` = template + optional binding. Factory `createInstance()`. `isExpired()` checks TTL.
- `factory.ts` — `AgentFactory` class: `createInstance()`, `toClaudeCodeSpec()` (generates Claude Code `--agents` JSON), `writeAgentFile()` (creates `.md` with YAML frontmatter), `listInstances()`, `removeInstance()`.
- `bridge.ts` — `modeToTemplate()` converts existing `BaseMode` subclasses into `AgentTemplate` for migration.

### src/config/ — Configuration (1 module)
- `loader.ts` — Unified `kodo.yaml` config loader. `loadKodoConfig(baseDir)` reads `kodo.yaml`, merges with env vars, returns typed `KodoConfig` (RAG + cost). Priority: env vars > kodo.yaml > defaults. Never throws.

### src/rag/ — RAG (3 modules)
- `connector.ts` — Multi-strategy connector: primary NotebookLM MCP (subprocess `npx notebooklm-mcp`), Gemini API, or **File Search** (`file_search_store_names` with per-mode store mapping). Dual circuit breakers (threshold=3, reset=60s). Per-mode notebook binding via `setCurrentMode()`. Public methods: `query()`, `enrich()`, `deepResearch()`. Strategies: `"mcp" | "api" | "file_search" | "none"`.
- `file-search.ts` — Gemini File Search backend via native `fetch()`. `queryFileSearch()` sends to `generativelanguage.googleapis.com` with `file_search_store_names` and optional `metadataFilter`. `parseGeminiResponse()` extracts answer + sources from `groundingMetadata.groundingChunks`.
- `cache.ts` — Query cache with 7-day TTL. BM25-based fuzzy matching (threshold 0.5). Stable hash IDs (SHA-256). Atomic write-then-rename. `CacheEntry` stores `sources[]` for provenance. `getWithSources()` returns `{ answer, sources }`.

### src/hooks/ — Hook handlers (8 modules)
- `cli.ts` — Main dispatcher for 9 hook types. Reads JSON stdin, validates ALL payloads (9 validators), normalizes snake_case→camelCase, routes to handler, writes JSON stdout. Accepts both official (`tool_name`/`tool_input`) and legacy (`tool`/`params`) field names.
- `session-start.ts` — Loads user profile traits + runs `buildMemoryContext()` recall pipeline (BM25+decay). Uses last user prompt as BM25 query (task-driven recall), falls back to `"recent project context"` if no prompt saved. Falls back to cell count if no cells match. Returns `additionalContext` for Claude.
- `user-prompt-submit.ts` — Scans user prompts with injection scanner. Blocks at score >= 4. Warns at score >= 1. Exports `persistLastPrompt()` for task-driven recall.
- `post-tool-failure.ts` — Logs tool failures to daily `{date}-failures.jsonl` audit file.
- `stop.ts` — Session stop: audit summary with tool count + duration.
- `notification.ts` — Alert logging to daily JSONL (info/warning/critical).
- `precompact.ts` — Memory checkpoint before context compaction.
- `session-end.ts` — Session termination audit record with reason.

### src/ui/ — Web dashboard (3 modules)
- `server.ts` — Bun HTTP server bound to 127.0.0.1 only. HMAC auth on `/api/*` routes. Prefix-safe Bearer token extraction.
- `auth.ts` — HMAC-SHA256 pairing + session tokens. Timing-safe comparison with hex validation. Session token TTL enforcement (default 24h, configurable `ttlMs` parameter).
- `routes.ts` — REST endpoints: `/api/status`, `/api/cost`, `/api/memory`, `/api/plan`, `/api/audit`.

### src/cli/ — CLI commands (3 modules)
- `commands.ts` — Parse `/kodo <command>` with 11 valid commands.
- `alerts.ts` — Anomaly checking against session metrics thresholds.
- `dashboard.ts` — ASCII dashboard renderer.

### Plugin root — metadata and configuration
- `.claude-plugin/plugin.json` — Plugin manifest (name, version 0.5.0, author, license, keywords)
- `settings.json` — Default agent (`code`), tool permissions
- `agents/*.md` — 5 agent definitions (code, architect, debug, review, security-audit)
- `commands/*.md` — 11 slash commands (status, plan, memory, audit, cost, health, mode, autonomy, stop, undo, ui)
- `skills/kodo-context/SKILL.md` — Auto-invoked Kodo context skill
- `skills/security-check/SKILL.md` — OWASP security check skill
- `hooks/hooks.json` — 9 hook registrations (official nested plugin format)

### Root entry points
- `src/index.ts` — `initKodo()`: creates directory structure + default config + vault.
- `src/plugin.ts` — `handlePreToolUse()`, `handlePostToolUse()`: path blocking, risk classification, injection scanning, output guard. `extractPaths()` covers read/write/edit/glob/grep tools. `PreToolResult` includes optional `updatedInput` and `systemMessage`. `PostToolResult` includes `outputThreats: string[]`.

## Documentation

For detailed documentation beyond this AI-facing reference:

- [Installation Guide](docs/INSTALL.md) — prerequisites, step-by-step setup, verification
- [Quick Start](docs/QUICKSTART.md) — 5-minute first session walkthrough
- [Hooks Reference](docs/HOOKS.md) — all 9 hook payload schemas with JSON examples
- [Architecture](docs/ARCHITECTURE.md) — layer model, data flows, module map
- [Memory System](docs/MEMORY.md) — MemCell, decay, BM25, recall pipeline
- [Troubleshooting](docs/TROUBLESHOOTING.md) — common problems and solutions
- [Security](SECURITY.md) — OWASP coverage, threat model, encryption
- [Contributing](CONTRIBUTING.md) — conventions, testing, commit workflow
- [Changelog](CHANGELOG.md) — version history

## Key patterns

### Security
- 4 autonomy levels: guarded → supervised → trusted → autonomous
- autonomous mode BLOCKS critical commands (never auto-approves)
- Shell commands classified by regex pattern matching against CRITICAL/HIGH/MEDIUM lists
- Sensitive paths blocked for read/write/edit/glob/grep tools
- HMAC comparison uses `timingSafeEqual` with hex format validation guard
- Vault uses atomic write-then-rename to prevent corruption
- RAG cache also uses atomic write-then-rename
- All external content scanned for injection before use
- Memory writes scanned for injection (blocks at score >= 4)
- LLM output scanned by output guard for XSS, code injection, SQL injection
- Zero-width characters stripped before injection scanning
- Unicode homoglyphs normalized (Cyrillic → Latin) before scanning
- User prompts scanned for injection before Claude processes them
- System prompt includes anti-leakage armor (LLM07 defense)
- Audit log is append-only JSONL, one file per day
- Behavioral baseline prunes stale events (bounded memory)
- Kill switch halts Claude entirely via `continue: false`
- Content redaction preserves original regex flags

### Memory
- 4-phase lifecycle: encode (createMemCell) → consolidate (Jaccard clustering) → decay (Ebbinghaus retention) → recall (BM25 + RRF + decay weighting)
- MemCells have SHA-256 checksums; tampered cells detected via `verifyChecksum()`
- MemCells have optional `importance` field (default 1.0) affecting decay rate
- `importance: Infinity` → retention always 1.0 (architectural decisions that must never decay)
- Decay: `retention(t) = e^(-(t/S)^0.8)` where S = importance * 7 days
- Pruning: cells below 10% retention removed by `pruneDecayed()`
- `applyDecayToScores()` in recall multiplies BM25 scores by retention
- BM25 tokenizer applies Porter stemming + stop word removal
- Stemmer rule order: `-ation` before `-tion` (more specific first)
- Scenes use `crypto.randomUUID()` for collision-resistant IDs
- Consolidation appends facts to summary (not identity-map)
- `loadMemCells()` validates JSON with `isMemCell()` type guard, skips invalid files
- `getTemporaryStates()` filters expired entries (non-mutating)
- `buildMemoryContext()` pipeline: loadMemCells → BM25 index → search → decay weighting → formatted markdown
- SessionStart hook reads `memory/last-prompt.txt` for task-driven recall query, falls back to `"recent project context"`
- UserPromptSubmit hook persists prompt to `memory/last-prompt.txt` (truncated to 500 chars) before injection scan

### Hooks
- 9 registered hook types in official nested plugin format
- `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}` for portable paths
- CLI accepts both official (`tool_name`/`tool_input`/`session_id`) and legacy field names
- All 9 hook payloads validated before processing; invalid → exit code 2
- Snake_case fields normalized to camelCase before passing to handlers
- PreToolUse: `hookSpecificOutput` with `permissionDecision`, optional `updatedInput`, optional top-level `systemMessage`
- PostToolUse: top-level `decision: "block"` or `hookSpecificOutput.additionalContext`, optional top-level `systemMessage` for output threats
- SessionStart: `hookSpecificOutput.additionalContext` with profile + memory summary
- UserPromptSubmit: top-level `decision: "block"` for injection
- Kill switch: `{ continue: false, stopReason }` halts Claude entirely

### Context
- Token budget: 3000 tokens (4 chars/token = 12K chars max)
- Priority order for truncation: mode instructions > profile > memory > RAG > plan
- Anti-leakage armor appended to system prompt (within budget)

## Testing
- Every `src/X/Y.ts` has corresponding `test/X/Y.test.ts`
- 525 tests, 1119 expect() calls, 0 failures, 56 test files
- Security tests are mandatory: blocklist, injection, output-guard, vault, policy, baseline, circuit-breaker, integrity, rate-limiter, cost-tracker
- Integration test in `test/integration.test.ts` covers full pipeline
- Always await async operations in tests (no fire-and-forget)
- Use `{ force: true }` on `rm()` in `afterEach` cleanup
- Test temp dirs: `mkdtemp(join(tmpdir(), "kodo-<module>-"))`
- Validate type guards in tests (loadMemCells skips invalid JSON)

## Dependencies
- `@noble/ciphers` ^1.2.0 — XChaCha20-Poly1305 encryption
- `yaml` ^2.7.0 — YAML parsing for custom modes
- No other runtime deps allowed without design review
- Dev: `@biomejs/biome` ^1.9.0, `@types/bun`

## Scripts
- `bun test` — Run all tests
- `bun run check` — Biome lint + format check
- `bun run check:fix` — Auto-fix biome issues
- `bun run build` — Build to dist/

## Security rules
- NEVER store secrets in plaintext
- NEVER bind web UI to 0.0.0.0
- NEVER skip HMAC auth on UI routes
- NEVER execute CRITICAL commands without confirmation
- NEVER auto-approve critical in autonomous mode
- ALWAYS scan external content for injection
- ALWAYS scan user prompts for injection (UserPromptSubmit hook)
- ALWAYS scan memory writes for injection
- ALWAYS scan LLM output with output guard
- ALWAYS log to audit before executing
- ALWAYS use timing-safe comparison for HMAC
- ALWAYS use atomic write-then-rename for vault and cache operations
- ALWAYS validate hook payloads before processing
- ALWAYS validate JSON from disk with type guards before use
- ALWAYS preserve regex flags when reconstructing patterns

## OWASP coverage

### Agentic Top 10 (2026)
- ASI01 (Agent Goal Hijack): Aho-Corasick scanner (44 markers), homoglyph normalization, zero-width stripping, user prompt scanning
- ASI02 (Tool Misuse): Risk classifier, autonomy policy matrix, sensitive path blocklist
- ASI03 (Identity & Privilege Abuse): 4-level autonomy with mode-specific tool restrictions, YAML loader validates autonomy values
- ASI04 (Supply Chain Vulnerabilities): SHA-256 manifest verification for skill files
- ASI05 (Unexpected Code Execution): Output guard scans for XSS, eval, SQL injection, destructive commands, credential leakage
- ASI06 (Memory & Context Poisoning): MemCell checksums, injection scanning on writes, type guard validation
- ASI08 (Cascading Failures): Circuit breaker on RAG connector
- ASI09 (Human-Agent Trust Exploitation): Append-only JSONL audit, daily rotation, failure logging
- ASI10 (Rogue Agents): Behavioral baseline with kill switch at 2x threshold, `continue: false`

### LLM Top 10 (2025)
- LLM01 (Prompt Injection): Same as ASI01 above
- LLM05 (Improper Output Handling): Output guard module (17 patterns), content redaction
- LLM07 (System Prompt Leakage): 10 prompt extraction markers in injection scanner, anti-leakage armor in system prompt, output guard detects system prompt and instruction leakage
- LLM07 (System Prompt Leakage): 10 prompt extraction markers in injection scanner, anti-leakage armor in system prompt
