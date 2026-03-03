# Kodo — AI Instructions

## Project overview
Kodo is a Claude Code plugin providing intelligent memory, hierarchical
planning, security, and NotebookLM RAG integration.
88 TypeScript files (46 src + 42 test), ~6K LOC, Bun runtime.

## Architecture
```
Plugin Surface (hooks, CLAUDE.md, slash commands)
    |
    v
Mode Engine  <-->  Memory Engine  <-->  Policy Kernel
    |                   |                    |
 Planner          BM25 + MemCells      Audit + Vault
    |                   |                    |
  Library         Stemmer + RRF       Circuit Breaker
                        |              Rate Limiter
                    Profile            Cost Tracker
                                       Integrity
                                       Baseline
```

6 hooks registered in `hooks/hooks.json`:
PreToolUse, PostToolUse, Stop, Notification, PreCompact, SessionEnd.

All hooks read JSON from stdin, write JSON to stdout via `src/hooks/cli.ts`.
PreToolUse outputs `hookSpecificOutput` format with `permissionDecision: "allow"|"deny"|"ask"`.

## Conventions
- TypeScript strict, no `any`
- Biome for lint+format: tabs, 100 char line width, recommended rules
- `bun run check` before commit (zero errors required)
- `bun test` before commit (266 tests, 603 expect() calls, zero failures)
- Naming: camelCase functions/vars, PascalCase types/classes
- Files: kebab-case.ts
- One export per file preferred
- No default exports
- Await all promises that do I/O (no fire-and-forget writes)

## File structure

### src/security/ — Policy kernel (10 modules)
- `vault.ts` — XChaCha20-Poly1305 encrypted secret store. Atomic write-then-rename. Key file restricted to mode 0o600.
- `policy.ts` — Shell risk classifier (low/medium/high/critical) + autonomy policy matrix. Exports `classifyShellRisk()`, `shouldConfirm()`.
- `blocklist.ts` — Sensitive path blocking (`.env`, `.ssh/*`, credentials). Content redaction for API keys, Bearer tokens, private keys.
- `injection.ts` — Aho-Corasick O(n) multi-pattern scanner with 30+ markers. Unicode homoglyph normalization (Cyrillic→Latin). Zero-width character stripping. Roleplay detection.
- `audit.ts` — Append-only JSONL log, one file per day. Exports `AuditLog` class.
- `baseline.ts` — Behavioral anomaly detection. Tracks tool call frequency, injection attempts, sensitive access. Kill switch at 2x threshold (`shouldTerminate`).
- `circuit-breaker.ts` — closed→open→half_open states. Prevents cascading failures. Wired into RAG connector.
- `cost-tracker.ts` — Token usage tracking with USD budget enforcement.
- `rate-limiter.ts` — Sliding window rate limiter for tool calls.
- `integrity.ts` — SHA-256 manifest for skill file verification.

### src/memory/ — Memory engine (6 modules)
- `memcell.ts` — Episodic memory unit. SHA-256 checksums for tamper detection. Injection scanning on write (`scanForInjection` blocks score >= 4). Exports `createMemCell()`, `loadMemCells()`, `computeChecksum()`, `verifyChecksum()`.
- `memscene.ts` — Scene clustering via Jaccard similarity (threshold 0.3). Crypto-safe IDs (`randomUUID`). Exports `consolidate()`, `loadMemScenes()`.
- `profile.ts` — User traits (stable) + temporary states (expiring ISO date). Exports `UserProfile` class.
- `recall.ts` — Cosine similarity, Reciprocal Rank Fusion (k=60), TF-IDF vectorization. No external deps.
- `bm25.ts` — Full-text search using BM25 ranking (k1=1.5, b=0.75). Serializable index. Integrates stemmer + stop words.
- `stemmer.ts` — Simplified Porter stemmer (14 suffix rules) + 88 English stop words.

### src/modes/ — Mode engine (9 modules)
- `base-mode.ts` — Abstract `BaseMode` class. Properties: `name`, `slug`, `instructions`, `allowedTools`, `autonomyLevel`, `memoryDepth`, `planningEnabled`.
- `detector.ts` — Heuristic mode detection from user message keywords. Returns `BuiltInSlug`.
- `loader.ts` — Load custom modes from YAML files in `~/.kodo/modes/`. Supports `extends` inheritance.
- `built-in/code.ts` — CodeMode: trusted, full tools, planning enabled.
- `built-in/architect.ts` — ArchitectMode: supervised, read-only, full memory.
- `built-in/ask.ts` — AskMode: guarded, read-only, no planning.
- `built-in/debug.ts` — DebugMode: trusted, full tools, full memory.
- `built-in/plan.ts` — PlanMode: guarded, read-only, planning enabled.
- `built-in/review.ts` — ReviewMode: guarded, read-only, no planning.

### src/planning/ — Planning (3 modules)
- `planner.ts` — Milestone-based plans. Exports `createPlan()`, `getActiveMilestone()`, `updateMilestone()`, `isPlanComplete()`, `renderPlanContext()`.
- `hints.ts` — Contextual step hints based on milestone + last action/error.
- `library.ts` — Archive/retrieve past plans. Word-overlap similarity search.

### src/context/ — System prompt assembly (3 modules)
- `assembler.ts` — 6-step pipeline with token budget (3000 tokens = 12K chars). Truncates with priority order.
- `sanitizer.ts` — Injection scan + confidential content redaction. Wraps output in delimiters.
- `sufficiency.ts` — Context completeness check + query expansion for short queries.

### src/rag/ — NotebookLM RAG (2 modules)
- `connector.ts` — Multi-strategy connector (MCP, Python, API). Circuit breaker on failures (threshold=3, reset=60s).
- `cache.ts` — Query cache with 7-day TTL. BM25-based fuzzy matching (threshold 0.5). Stable hash IDs (SHA-256).

### src/hooks/ — Hook handlers (5 modules)
- `cli.ts` — Main dispatcher. Reads JSON stdin, validates payload, routes to handler, writes JSON stdout. `HookType` union of 6 types. Input validation via `validatePreToolInput()`/`validatePostToolInput()`.
- `stop.ts` — Session stop: audit summary with tool count + duration.
- `notification.ts` — Alert logging to daily JSONL (info/warning/critical).
- `precompact.ts` — Memory checkpoint before context compaction.
- `session-end.ts` — Session termination audit record with reason.

### src/ui/ — Web dashboard (3 modules)
- `server.ts` — Bun HTTP server bound to 127.0.0.1 only. HMAC auth on `/api/*` routes.
- `auth.ts` — HMAC-SHA256 pairing + session tokens. Timing-safe comparison with hex validation.
- `routes.ts` — REST endpoints: `/api/status`, `/api/cost`, `/api/memory`, `/api/plan`, `/api/audit`.

### src/cli/ — CLI commands (3 modules)
- `commands.ts` — Parse `/kodo <command>` with 11 valid commands.
- `alerts.ts` — Anomaly checking against session metrics thresholds.
- `dashboard.ts` — ASCII dashboard renderer.

### Root entry points
- `src/index.ts` — `initKodo()`: creates directory structure + default config + vault.
- `src/plugin.ts` — `handlePreToolUse()`, `handlePostToolUse()`: path blocking, risk classification, injection scanning. `extractPaths()` covers read/write/edit/glob/grep tools.

## Key patterns

### Security
- 4 autonomy levels: guarded → supervised → trusted → autonomous
- autonomous mode BLOCKS critical commands (never auto-approves)
- Shell commands classified by regex pattern matching against CRITICAL/HIGH/MEDIUM lists
- Sensitive paths blocked for read/write/edit/glob/grep tools
- HMAC comparison uses `timingSafeEqual` with hex format validation guard
- Vault uses atomic write-then-rename to prevent corruption
- All external content scanned for injection before use
- Memory writes scanned for injection (blocks at score >= 4)
- Zero-width characters stripped before injection scanning
- Unicode homoglyphs normalized (Cyrillic → Latin) before scanning
- Audit log is append-only JSONL, one file per day

### Memory
- 3-phase lifecycle: encode (createMemCell) → consolidate (Jaccard clustering) → recall (BM25 + RRF)
- MemCells have SHA-256 checksums; tampered cells detected via `verifyChecksum()`
- BM25 tokenizer applies Porter stemming + stop word removal
- Scenes use `crypto.randomUUID()` for collision-resistant IDs
- Consolidation appends facts to summary (not identity-map)
- `loadMemCells()` returns `[]` for missing directories (no throw)

### Hooks
- All hooks use stdin/stdout JSON protocol
- PreToolUse outputs `hookSpecificOutput` format:
  ```json
  {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "allow",
      "permissionDecisionReason": ""
    }
  }
  ```
- Policy decisions mapped: block→deny, confirm→ask, allow→allow
- Invalid payloads exit with code 2 and stderr message

### Context
- Token budget: 3000 tokens (4 chars/token = 12K chars max)
- Priority order for truncation: mode instructions > profile > memory > RAG > plan

## Testing
- Every `src/X/Y.ts` has corresponding `test/X/Y.test.ts`
- 266 tests, 603 expect() calls, 0 failures
- Security tests are mandatory: blocklist, injection, vault, policy, baseline, circuit-breaker, integrity, rate-limiter, cost-tracker
- Integration test in `test/integration.test.ts` covers full pipeline
- Always await async operations in tests (no fire-and-forget)
- Use `{ force: true }` on `rm()` in `afterEach` cleanup
- Test temp dirs: `mkdtemp(join(tmpdir(), "kodo-<module>-"))`

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
- ALWAYS scan memory writes for injection
- ALWAYS log to audit before executing
- ALWAYS use timing-safe comparison for HMAC
- ALWAYS use atomic write-then-rename for vault operations
- ALWAYS validate hook payloads before processing

## OWASP Agentic 2026 coverage
- ASI01 (Prompt Injection): Aho-Corasick scanner, homoglyph normalization, zero-width stripping
- ASI02 (Tool Misuse): Risk classifier, autonomy policy matrix, sensitive path blocklist
- ASI03 (Excessive Authority): 4-level autonomy with mode-specific tool restrictions
- ASI04 (Skill Integrity): SHA-256 manifest verification
- ASI06 (Memory Poisoning): MemCell checksums, injection scanning on writes
- ASI08 (Cascading Failures): Circuit breaker on RAG connector
- ASI09 (Logging): Append-only JSONL audit, daily rotation
- ASI10 (Anomaly Detection): Behavioral baseline with kill switch at 2x threshold
