# Kodo — AI Instructions

## Project overview
Kodo is a Claude Code plugin providing intelligent memory, hierarchical
planning, security, and NotebookLM RAG integration.
98 TypeScript files (51 src + 47 test), ~7.5K LOC, Bun runtime.

## Architecture
```
Plugin Surface (9 hooks, CLAUDE.md, slash commands)
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
- `bun test` before commit (338 tests, 742 expect() calls, zero failures)
- Naming: camelCase functions/vars, PascalCase types/classes
- Files: kebab-case.ts
- One export per file preferred
- No default exports
- Await all promises that do I/O (no fire-and-forget writes)
- All hook payloads MUST be validated before processing (exit 2 on failure)
- All JSON deserialized from disk MUST be validated with type guards

## File structure

### src/security/ — Policy kernel (11 modules)
- `vault.ts` — XChaCha20-Poly1305 encrypted secret store. Atomic write-then-rename. Key file restricted to mode 0o600.
- `policy.ts` — Shell risk classifier (low/medium/high/critical) + autonomy policy matrix. Covers python -c, node -e, docker run, PowerShell -enc, eval(), exec(). Exports `classifyShellRisk()`, `shouldConfirm()`.
- `blocklist.ts` — Sensitive path blocking (`.env`, `.ssh/*`, credentials). Content redaction preserving original regex flags. Exports `isSensitivePath()`, `isConfidentialContent()`, `redactConfidential()`.
- `injection.ts` — Aho-Corasick O(n) multi-pattern scanner with 44 markers across 7 categories: role override, identity swap, system prompt, instruction override, social engineering, roleplay, prompt extraction (LLM07). Unicode homoglyph normalization (Cyrillic→Latin). Zero-width character stripping.
- `output-guard.ts` — Scans LLM output for 11 dangerous patterns: XSS (script tags, javascript: URIs, event handlers), code execution (eval, Function, import, child_process), SQL injection (DROP TABLE, DELETE FROM, UNION SELECT), destructive commands (rm -rf /). Covers OWASP ASI05 + LLM05.
- `audit.ts` — Append-only JSONL log, one file per day. Exports `AuditLog` class.
- `baseline.ts` — Behavioral anomaly detection. Tracks tool call frequency, injection attempts, sensitive access. Prunes stale events outside 5-minute window. Kill switch at 2x threshold (`shouldTerminate`).
- `circuit-breaker.ts` — closed→open→half_open states. Prevents cascading failures. Wired into RAG connector.
- `cost-tracker.ts` — Token usage tracking with USD budget enforcement.
- `rate-limiter.ts` — Sliding window rate limiter for tool calls.
- `integrity.ts` — SHA-256 manifest for skill file verification.

### src/memory/ — Memory engine (7 modules)
- `memcell.ts` — Episodic memory unit with optional `importance` field (0.0-1.0+, default 1.0). SHA-256 checksums for tamper detection. Injection scanning on write (blocks score >= 4). `isMemCell()` type guard validates JSON before loading. Exports `createMemCell()`, `loadMemCells()`, `computeChecksum()`, `verifyChecksum()`.
- `memscene.ts` — Scene clustering via Jaccard similarity (threshold 0.3). Crypto-safe IDs (`randomUUID`). Exports `consolidate()`, `loadMemScenes()`.
- `profile.ts` — User traits (stable) + temporary states (expiring ISO date). `getTemporaryStates()` filters expired entries. `renderContext()` is non-mutating (does not call `purgeExpired()`). Exports `UserProfile` class.
- `recall.ts` — Cosine similarity, Reciprocal Rank Fusion (k=60), TF-IDF vectorization. `applyDecayToScores()` multiplies BM25 scores by retention factors. No external deps.
- `bm25.ts` — Full-text search using BM25 ranking (k1=1.5, b=0.75). Serializable index. Integrates stemmer + stop words.
- `stemmer.ts` — Simplified Porter stemmer (14 suffix rules, `-ation` before `-tion` for correct ordering) + 88 English stop words.
- `decay.ts` — FadeMem-inspired importance-weighted decay. `retention(t) = e^(-(t/S)^β)` where S = importance * 7 days, β = 0.8 (sub-linear). Prune threshold 10%. Exports `computeRetention()`, `applyDecay()`, `pruneDecayed()`.

### src/modes/ — Mode engine (9 modules)
- `base-mode.ts` — Abstract `BaseMode` class. Properties: `name`, `slug`, `instructions`, `allowedTools`, `autonomyLevel`, `memoryDepth`, `planningEnabled`.
- `detector.ts` — Heuristic mode detection from user message keywords. Returns `BuiltInSlug`.
- `loader.ts` — Load custom modes from YAML files. Validates `autonomy` against allowed values. Rejects slugs that conflict with built-ins (code, architect, ask, debug, plan, review). Supports `extends` inheritance.
- `built-in/code.ts` — CodeMode: trusted, full tools, planning enabled.
- `built-in/architect.ts` — ArchitectMode: supervised, read-only, full memory.
- `built-in/ask.ts` — AskMode: guarded, read-only, no planning.
- `built-in/debug.ts` — DebugMode: trusted, full tools, full memory.
- `built-in/plan.ts` — PlanMode: guarded, read-only, planning enabled.
- `built-in/review.ts` — ReviewMode: guarded, read-only, no planning.

### src/planning/ — Planning (3 modules)
- `planner.ts` — Milestone-based plans. Exports `createPlan()`, `getActiveMilestone()`, `updateMilestone()`, `isPlanComplete()`, `renderPlanContext()`.
- `hints.ts` — Contextual step hints based on milestone + last action/error.
- `library.ts` — Archive/retrieve past plans. Per-file error handling (skips corrupt JSON). Word-overlap similarity search.

### src/context/ — System prompt assembly (3 modules)
- `assembler.ts` — 6-step pipeline with token budget (3000 tokens = 12K chars). Truncates with priority order. Appends anti-leakage armor suffix (LLM07 defense).
- `sanitizer.ts` — Injection scan + confidential content redaction. Wraps output in delimiters.
- `sufficiency.ts` — Context completeness check + query expansion for short queries.

### src/rag/ — NotebookLM RAG (2 modules)
- `connector.ts` — Multi-strategy connector (MCP, Python, API). Circuit breaker on failures (threshold=3, reset=60s).
- `cache.ts` — Query cache with 7-day TTL. BM25-based fuzzy matching (threshold 0.5). Stable hash IDs (SHA-256). Atomic write-then-rename.

### src/hooks/ — Hook handlers (8 modules)
- `cli.ts` — Main dispatcher for 9 hook types. Reads JSON stdin, validates ALL payloads (9 validators), normalizes snake_case→camelCase, routes to handler, writes JSON stdout. Accepts both official (`tool_name`/`tool_input`) and legacy (`tool`/`params`) field names.
- `session-start.ts` — Loads user profile traits + counts memory cells. Returns `additionalContext` for Claude.
- `user-prompt-submit.ts` — Scans user prompts with injection scanner. Blocks at score >= 4. Warns at score >= 1.
- `post-tool-failure.ts` — Logs tool failures to daily `{date}-failures.jsonl` audit file.
- `stop.ts` — Session stop: audit summary with tool count + duration.
- `notification.ts` — Alert logging to daily JSONL (info/warning/critical).
- `precompact.ts` — Memory checkpoint before context compaction.
- `session-end.ts` — Session termination audit record with reason.

### src/ui/ — Web dashboard (3 modules)
- `server.ts` — Bun HTTP server bound to 127.0.0.1 only. HMAC auth on `/api/*` routes. Prefix-safe Bearer token extraction.
- `auth.ts` — HMAC-SHA256 pairing + session tokens. Timing-safe comparison with hex validation.
- `routes.ts` — REST endpoints: `/api/status`, `/api/cost`, `/api/memory`, `/api/plan`, `/api/audit`.

### src/cli/ — CLI commands (3 modules)
- `commands.ts` — Parse `/kodo <command>` with 11 valid commands.
- `alerts.ts` — Anomaly checking against session metrics thresholds.
- `dashboard.ts` — ASCII dashboard renderer.

### Root entry points
- `src/index.ts` — `initKodo()`: creates directory structure + default config + vault.
- `src/plugin.ts` — `handlePreToolUse()`, `handlePostToolUse()`: path blocking, risk classification, injection scanning, output guard. `extractPaths()` covers read/write/edit/glob/grep tools. `PostToolResult` includes `outputThreats: string[]`.

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
- Decay: `retention(t) = e^(-(t/S)^0.8)` where S = importance * 7 days
- Pruning: cells below 10% retention removed by `pruneDecayed()`
- `applyDecayToScores()` in recall multiplies BM25 scores by retention
- BM25 tokenizer applies Porter stemming + stop word removal
- Stemmer rule order: `-ation` before `-tion` (more specific first)
- Scenes use `crypto.randomUUID()` for collision-resistant IDs
- Consolidation appends facts to summary (not identity-map)
- `loadMemCells()` validates JSON with `isMemCell()` type guard, skips invalid files
- `getTemporaryStates()` filters expired entries (non-mutating)

### Hooks
- 9 registered hook types in official nested plugin format
- `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}` for portable paths
- CLI accepts both official (`tool_name`/`tool_input`/`session_id`) and legacy field names
- All 9 hook payloads validated before processing; invalid → exit code 2
- Snake_case fields normalized to camelCase before passing to handlers
- PreToolUse: `hookSpecificOutput` with `permissionDecision`
- PostToolUse: top-level `decision: "block"` or `hookSpecificOutput.additionalContext`
- SessionStart: `hookSpecificOutput.additionalContext` with profile + memory summary
- UserPromptSubmit: top-level `decision: "block"` for injection
- Kill switch: `{ continue: false, stopReason }` halts Claude entirely

### Context
- Token budget: 3000 tokens (4 chars/token = 12K chars max)
- Priority order for truncation: mode instructions > profile > memory > RAG > plan
- Anti-leakage armor appended to system prompt (within budget)

## Testing
- Every `src/X/Y.ts` has corresponding `test/X/Y.test.ts`
- 338 tests, 742 expect() calls, 0 failures, 47 test files
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
- ASI05 (Unexpected Code Execution): Output guard scans for XSS, eval, SQL injection, destructive commands
- ASI06 (Memory & Context Poisoning): MemCell checksums, injection scanning on writes, type guard validation
- ASI08 (Cascading Failures): Circuit breaker on RAG connector
- ASI09 (Human-Agent Trust Exploitation): Append-only JSONL audit, daily rotation, failure logging
- ASI10 (Rogue Agents): Behavioral baseline with kill switch at 2x threshold, `continue: false`

### LLM Top 10 (2025)
- LLM01 (Prompt Injection): Same as ASI01 above
- LLM05 (Improper Output Handling): Output guard module, content redaction
- LLM07 (System Prompt Leakage): 10 prompt extraction markers in injection scanner, anti-leakage armor in system prompt
