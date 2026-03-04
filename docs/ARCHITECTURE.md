# Architecture

Kodo is organized in 3 layers with 52 TypeScript source modules, 2 runtime dependencies, and 9 hooks.

## Layer Model

```
Layer 0: Plugin Surface
  .claude-plugin/plugin.json    Plugin manifest (v0.4.0)
  hooks/hooks.json              9 hook registrations
  agents/                       5 agent definitions (code, architect, debug, review, security-audit)
  commands/                     11 slash commands (/kodo:status, /kodo:plan, ...)
  skills/                       2 auto-invoked skills (kodo-context, security-check)
  settings.json                 Default agent + permissions
  CLAUDE.md                     AI-facing instructions

Layer 1: Engines
  Mode Engine                   6 built-in modes + custom YAML modes
  Memory Engine                 MemCell → MemScene → BM25 → Recall
  Policy Kernel                 Risk classifier → Policy matrix → Audit log

Layer 2: Infrastructure
  Vault                         XChaCha20-Poly1305 encrypted secrets
  Circuit Breaker               Cascading failure prevention
  Rate Limiter                  Sliding window tool call throttling
  Cost Tracker                  Token usage with USD budget
  Baseline                      Behavioral anomaly detection
  Integrity                     SHA-256 skill file verification
```

## Data Flow

### Hook Pipeline

Every Claude Code interaction flows through this pipeline:

```
User prompt
    │
    ├── UserPromptSubmit
    │     Scan for injection (44 markers)
    │     Score >= 4 → block prompt
    │     Score 1-3 → warn
    │
    ▼
Claude selects tool
    │
    ├── PreToolUse
    │     1. extractPaths() from tool params
    │     2. isSensitivePath() check against blocklist
    │     3. classifyShellRisk() → low/medium/high/critical
    │     4. shouldConfirm() via autonomy policy matrix
    │     → hookSpecificOutput: allow/deny/ask
    │     → or: { continue: false } for kill switch
    │
    ▼
Tool executes (or is blocked)
    │
    ├── PostToolUse
    │     1. scanForInjection() on output (44 markers)
    │     2. Normalize Unicode homoglyphs (Cyrillic → Latin)
    │     3. Strip zero-width characters
    │     4. redactConfidential() content
    │     5. Output guard: XSS/SQL/code injection (11 patterns)
    │     → decision: "block" or additionalContext warning
    │
    ├── PostToolUseFailure (on error)
    │     → Log failure to daily JSONL
    │
    ▼
Session lifecycle
    │
    ├── SessionStart → Load profile + memory context
    ├── PreCompact → Memory checkpoint before context compaction
    ├── Stop → Audit summary (tool count + duration)
    ├── Notification → Alert logging (info/warning/critical)
    └── SessionEnd → Final audit record
```

### Context Assembly Pipeline

```
Mode instructions (never truncated)
    +
Profile context (stable traits + temporary states)
    +
Memory context (recalled MemCells, BM25 + RRF ranked)
    +
RAG context (NotebookLM query results, cached)
    +
Plan context (active milestone + hints)
    │
    ▼
Token budget: 3000 tokens (4 chars/token = 12K chars max)
    │
    ▼
Truncation in priority order (plan first, mode last)
    │
    ▼
Anti-leakage armor suffix (LLM07 defense)
    │
    ▼
Final system prompt
```

## Module Map

### `src/security/` — Policy Kernel (11 modules)

| Module | Exports | Description |
|--------|---------|-------------|
| `vault.ts` | `Vault` class | XChaCha20-Poly1305 encrypted secret store. Atomic write-then-rename. Key file mode 0o600 |
| `policy.ts` | `classifyShellRisk()`, `shouldConfirm()` | Shell risk classifier (4 tiers) + autonomy policy matrix |
| `blocklist.ts` | `isSensitivePath()`, `isConfidentialContent()`, `redactConfidential()` | Sensitive path blocking (.env, .ssh/*, credentials). Content redaction preserving regex flags |
| `injection.ts` | `scanForInjection()` | Aho-Corasick O(n) scanner with 44 markers across 7 categories. Unicode normalization. Zero-width stripping |
| `output-guard.ts` | `guardOutput()` | Scans LLM output for 11 patterns: XSS, code execution, SQL injection, destructive commands |
| `audit.ts` | `AuditLog` class | Append-only JSONL log, one file per day |
| `baseline.ts` | `Baseline` class, `shouldTerminate()` | Behavioral anomaly detection. Tracks tool frequency, injection attempts, sensitive access. Kill switch at 2x threshold |
| `circuit-breaker.ts` | `CircuitBreaker` class | closed → open → half_open states. Prevents cascading failures |
| `cost-tracker.ts` | `CostTracker` class | Token usage tracking with USD budget enforcement |
| `rate-limiter.ts` | `RateLimiter` class | Sliding window rate limiter for tool calls |
| `integrity.ts` | `verifyManifest()` | SHA-256 manifest for skill file verification |

### `src/memory/` — Memory Engine (8 modules)

| Module | Exports | Description |
|--------|---------|-------------|
| `memcell.ts` | `createMemCell()`, `loadMemCells()`, `computeChecksum()`, `verifyChecksum()`, `isMemCell()` | Episodic memory unit. SHA-256 checksums. Injection scan on write (blocks score >= 4). Type guard validates JSON |
| `memscene.ts` | `consolidate()`, `loadMemScenes()` | Scene clustering via Jaccard similarity (threshold 0.3). Crypto-safe IDs |
| `profile.ts` | `UserProfile` class | Stable traits + temporary states with ISO expiry. Non-mutating `renderContext()` |
| `recall.ts` | `recall()`, `applyDecayToScores()` | Cosine similarity, RRF (k=60), TF-IDF. Decay-weighted BM25 scoring |
| `bm25.ts` | `BM25Index` class | Full-text search (k1=1.5, b=0.75). Serializable. Integrates stemmer + stop words |
| `stemmer.ts` | `stem()`, `isStopWord()` | Simplified Porter stemmer (14 rules, `-ation` before `-tion`) + 88 English stop words |
| `decay.ts` | `computeRetention()`, `applyDecay()`, `pruneDecayed()` | FadeMem-inspired: `retention(t) = e^(-(t/S)^0.8)` where S = importance x 7 days. Prune below 10%. `importance: Infinity` yields retention 1.0 (never decays) |
| `builder.ts` | `buildMemoryContext()` | Memory recall pipeline. Loads cells, builds BM25 index, applies decay-weighted scoring, returns formatted markdown. Wired into SessionStart hook |

### `src/modes/` — Mode Engine (9 modules)

| Module | Description |
|--------|-------------|
| `base-mode.ts` | Abstract `BaseMode` class: name, slug, instructions, allowedTools, autonomyLevel, memoryDepth, planningEnabled |
| `detector.ts` | Heuristic mode detection from user message keywords |
| `loader.ts` | Custom YAML mode loader. Validates autonomy values. Rejects built-in slug conflicts. Supports `extends` inheritance |
| `built-in/code.ts` | CodeMode: trusted autonomy, full tools, planning enabled |
| `built-in/architect.ts` | ArchitectMode: supervised, read-only tools, full memory |
| `built-in/ask.ts` | AskMode: guarded, read-only, no planning |
| `built-in/debug.ts` | DebugMode: trusted, full tools, full memory |
| `built-in/plan.ts` | PlanMode: guarded, read-only, planning enabled |
| `built-in/review.ts` | ReviewMode: guarded, read-only, no planning |

### `src/planning/` — Hierarchical Planner (3 modules)

| Module | Exports | Description |
|--------|---------|-------------|
| `planner.ts` | `createPlan()`, `getActiveMilestone()`, `updateMilestone()`, `isPlanComplete()`, `renderPlanContext()` | Milestone-based plans with status tracking |
| `hints.ts` | `getHint()` | Contextual step hints based on active milestone + last action/error |
| `library.ts` | `archivePlan()`, `findSimilarPlans()` | Plan archive with word-overlap similarity search. Per-file error handling (skips corrupt JSON) |

### `src/context/` — System Prompt Assembly (3 modules)

| Module | Exports | Description |
|--------|---------|-------------|
| `assembler.ts` | `assembleContext()` | 6-step pipeline with 3000-token budget. Truncates by priority. Appends anti-leakage armor |
| `sanitizer.ts` | `sanitize()` | Injection scan + confidential content redaction. Wraps in delimiters |
| `sufficiency.ts` | `checkSufficiency()` | Context completeness check + query expansion for short queries |

### `src/rag/` — NotebookLM RAG (2 modules)

| Module | Exports | Description |
|--------|---------|-------------|
| `connector.ts` | `RagConnector` class | Dual-strategy connector: NotebookLM MCP (primary) + Gemini File Search (fallback). Per-mode notebook binding. Dual circuit breakers |
| `cache.ts` | `RagCache` class | 7-day TTL cache. BM25 fuzzy matching (threshold 0.5). SHA-256 IDs. Atomic write-then-rename |

### `src/hooks/` — Hook Handlers (8 modules)

| Module | Description |
|--------|-------------|
| `cli.ts` | Main dispatcher for 9 hook types. Validates payloads. Normalizes snake_case → camelCase. Routes to handler |
| `session-start.ts` | Loads profile traits + runs buildMemoryContext() recall pipeline. Falls back to cell count if no matches. Returns additionalContext |
| `user-prompt-submit.ts` | Scans user prompts with injection scanner. Blocks at score >= 4. Warns at >= 1 |
| `post-tool-failure.ts` | Logs tool failures to daily `{date}-failures.jsonl` |
| `stop.ts` | Audit summary with tool count + session duration |
| `notification.ts` | Alert logging to daily JSONL (info/warning/critical) |
| `precompact.ts` | Memory checkpoint before context compaction |
| `session-end.ts` | Session termination audit record with reason |

### `src/ui/` — Web Dashboard (3 modules)

| Module | Description |
|--------|-------------|
| `server.ts` | Bun HTTP server bound to 127.0.0.1 only. HMAC auth on `/api/*` routes |
| `auth.ts` | HMAC-SHA256 pairing + session tokens. Timing-safe comparison with hex validation. TTL enforcement (default 24h) |
| `routes.ts` | REST endpoints: `/api/status`, `/api/cost`, `/api/memory`, `/api/plan`, `/api/audit` |

### `src/cli/` — CLI Commands (3 modules)

| Module | Description |
|--------|-------------|
| `commands.ts` | Parse `/kodo <command>` — 11 valid commands |
| `alerts.ts` | Anomaly checking against session metrics thresholds |
| `dashboard.ts` | ASCII dashboard renderer for `/kodo:status` |

### Root Entry Points

| Module | Description |
|--------|-------------|
| `src/index.ts` | `initKodo()`: creates directory structure + default config + vault |
| `src/plugin.ts` | `handlePreToolUse()`, `handlePostToolUse()`: path blocking, risk classification, injection scanning, output guard. `PostToolResult` includes `outputThreats: string[]` |

## Dependencies

Only 2 runtime dependencies (deliberate — minimizes supply chain attack surface, ASI04):

| Package | Version | Purpose | Why This One |
|---------|---------|---------|-------------|
| `@noble/ciphers` | ^1.2.0 | XChaCha20-Poly1305 encryption | Longer 24-byte nonce eliminates nonce-reuse risk (vs AES-GCM's 12 bytes) |
| `yaml` | ^2.7.0 | Custom mode YAML parsing | Standard, well-maintained YAML parser |

Dev dependencies:

| Package | Purpose |
|---------|---------|
| `@biomejs/biome` ^1.9.0 | Lint + format (tabs, 100 char width) |
| `@types/bun` latest | TypeScript definitions for Bun runtime |

## Key Design Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-03 | XChaCha20-Poly1305 over AES-GCM | 24-byte nonce eliminates nonce-reuse risk |
| 2026-03-03 | Aho-Corasick over regex | O(n) vs O(n*m) for multi-pattern matching |
| 2026-03-03 | BM25 over embedding search | Zero dependencies, no API calls, deterministic |
| 2026-03-03 | Jaccard over cosine for clustering | Simpler, works well for tag-based grouping |
| 2026-03-03 | 2 deps maximum | Minimize supply chain attack surface |
| 2026-03-04 | Autonomous blocks critical | Even max autonomy should never auto-approve destructive commands |
| 2026-03-04 | Atomic vault writes | Prevent corruption from process crashes mid-write |
| 2026-03-04 | Porter stemmer (simplified) | Full Porter has 60+ rules; 14 suffice for recall improvement |
| 2026-03-04 | hookSpecificOutput format | Conform to Claude Code plugin spec for PreToolUse responses |
| 2026-03-04 | Memory write injection scanning | Prevent poisoning via external content persisted to memory |
| 2026-03-04 | Official nested hook format | Conform to plugin spec with `type`/`command`/`${CLAUDE_PLUGIN_ROOT}` |
| 2026-03-04 | 9 hook types (up from 6) | Added SessionStart, UserPromptSubmit, PostToolUseFailure |
| 2026-03-04 | Output guard (ASI05) | Scan LLM output for XSS, eval, SQL injection, destructive commands |
| 2026-03-04 | FadeMem memory decay | Ebbinghaus retention with importance weighting |
| 2026-03-04 | Kill switch via continue: false | Halts Claude entirely instead of just denying one tool call |
| 2026-03-04 | Type guard validation | Reject invalid JSON from disk instead of trusting `as` casts |
