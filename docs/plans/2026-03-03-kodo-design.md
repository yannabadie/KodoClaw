# Kodo Design Document

> **Status:** Implemented (v0.1.0)
> **Created:** 2026-03-03
> **Updated:** 2026-03-04

## 1. Goal

Build a Claude Code plugin that provides intelligent memory, hierarchical planning,
a security kernel, and NotebookLM RAG integration. Zero-config for users, maximum
safety, minimal dependencies.

## 2. Design Principles

1. **Security by default** — Every tool call is inspected. Secrets are encrypted. Audit is mandatory.
2. **Minimal dependencies** — 2 runtime deps (`@noble/ciphers`, `yaml`). Everything else is hand-built.
3. **Zero external services** — No databases, no cloud APIs (except optional NotebookLM). Runs entirely on local filesystem.
4. **OWASP Agentic 2026** — Compliance with ASI01 through ASI10 where applicable.
5. **EU AI Act Article 14** — Kill switch, approval workflows, append-only audit.

## 3. Architecture

### 3.1 Layer Model

```
Layer 0: Plugin Surface
  hooks/hooks.json    6 registered hooks (PreToolUse, PostToolUse, Stop,
                      Notification, PreCompact, SessionEnd)
  CLAUDE.md           AI-facing project instructions
  CLI                 11 slash commands (/kodo status, mode, plan, ...)

Layer 1: Engines
  Mode Engine         6 built-in modes + custom YAML modes
  Memory Engine       MemCell → MemScene → BM25 → Recall
  Policy Kernel       Risk classifier → Policy matrix → Audit log

Layer 2: Infrastructure
  Vault               XChaCha20-Poly1305 encrypted secrets
  Circuit Breaker     Cascading failure prevention
  Rate Limiter        Sliding window tool call throttling
  Cost Tracker        Token usage with USD budget
  Baseline            Behavioral anomaly detection
  Integrity           SHA-256 skill file verification
```

### 3.2 Data Flow

```
                       stdin (JSON)
                           │
                    ┌──────▼──────┐
                    │ hooks/cli.ts │  Validates payload, dispatches
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼───┐  ┌─────▼─────┐  ┌──▼──────────┐
     │ PreToolUse │  │PostToolUse│  │ Stop/etc    │
     └────────┬───┘  └─────┬─────┘  └──┬──────────┘
              │            │            │
     ┌────────▼───┐  ┌─────▼─────┐  ┌──▼──────────┐
     │ plugin.ts  │  │ plugin.ts │  │ stop.ts     │
     │            │  │           │  │ session-end │
     │ extractPaths   scanInject │  │ precompact  │
     │ blocklist  │  │ sanitize  │  │ notification│
     │ riskClassify│ │ redact    │  └─────────────┘
     │ policyMatrix│ └───────────┘
     └────────┬───┘
              │
     ┌────────▼────────────────┐
     │ hookSpecificOutput      │
     │ {                       │
     │   permissionDecision:   │
     │     "allow"|"deny"|"ask"│
     │ }                       │
     └─────────────────────────┘
              │
           stdout (JSON)
```

### 3.3 File Layout

```
src/
├── security/          Policy kernel
│   ├── vault.ts         XChaCha20-Poly1305 encrypted KV store
│   ├── policy.ts        Risk classification + autonomy matrix
│   ├── blocklist.ts     Sensitive path + content blocking
│   ├── injection.ts     Aho-Corasick prompt injection scanner
│   ├── audit.ts         Append-only JSONL audit log
│   ├── baseline.ts      Behavioral anomaly detection
│   ├── circuit-breaker.ts  Cascading failure prevention
│   ├── cost-tracker.ts  Token usage + budget enforcement
│   ├── rate-limiter.ts  Sliding window rate limiter
│   └── integrity.ts     SHA-256 skill file verification
│
├── memory/            Memory engine
│   ├── memcell.ts       Episodic memory with checksums
│   ├── memscene.ts      Scene clustering (Jaccard similarity)
│   ├── profile.ts       User traits + temporary states
│   ├── recall.ts        Cosine similarity, RRF, TF-IDF
│   ├── bm25.ts          Full-text search index
│   └── stemmer.ts       Porter stemmer + stop words
│
├── modes/             Mode engine
│   ├── base-mode.ts     Abstract mode class
│   ├── detector.ts      Heuristic mode detection
│   ├── loader.ts        Custom YAML mode loader
│   └── built-in/        6 built-in modes
│
├── planning/          Hierarchical planner
│   ├── planner.ts       Milestone CRUD
│   ├── hints.ts         Contextual step hints
│   └── library.ts       Plan archive + similarity search
│
├── context/           System prompt assembly
│   ├── assembler.ts     Token budget pipeline (3K tokens)
│   ├── sanitizer.ts     Injection scan + redaction
│   └── sufficiency.ts   Context completeness check
│
├── rag/               NotebookLM RAG
│   ├── connector.ts     Multi-strategy connector + circuit breaker
│   └── cache.ts         7-day TTL cache with BM25 fuzzy match
│
├── hooks/             Hook handlers
│   ├── cli.ts           Main dispatcher (stdin/stdout JSON)
│   ├── stop.ts          Session stop handler
│   ├── notification.ts  Alert logging
│   ├── precompact.ts    Memory checkpoint
│   └── session-end.ts   Session end audit
│
├── ui/                Web dashboard
│   ├── server.ts        HTTP server (127.0.0.1 only)
│   ├── auth.ts          HMAC-SHA256 tokens
│   └── routes.ts        REST API endpoints
│
├── cli/               CLI commands
│   ├── commands.ts      Command parser
│   ├── alerts.ts        Anomaly checking
│   └── dashboard.ts     ASCII dashboard
│
├── index.ts           Plugin initialization
└── plugin.ts          Pre/post tool use handlers
```

## 4. Security Design

### 4.1 Threat Model

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| Prompt injection | Malicious content in tool output | Aho-Corasick scanner with 30+ markers |
| Unicode evasion | Cyrillic lookalikes, zero-width chars | Homoglyph normalization + ZW stripping |
| Memory poisoning | Injected facts via external content | Checksum verification + injection scan on writes |
| Secret exfiltration | Reading .env, .ssh, credentials | Sensitive path blocklist on all file tools |
| Command injection | Dangerous shell commands | 4-tier risk classifier + policy matrix |
| Cascading failure | External service outage | Circuit breaker (threshold=3, reset=60s) |
| Resource exhaustion | Token bombing | Cost tracker + budget limits |
| Skill tampering | Modified skill files | SHA-256 manifest integrity checks |
| Behavioral anomaly | Compromised agent | Baseline tracking, kill switch at 2x threshold |

### 4.2 Autonomy Matrix

```
              low      medium    high     critical
guarded      confirm   confirm   block    block
supervised   allow     confirm   confirm  block
trusted      allow     allow     confirm  block
autonomous   allow     allow     allow    BLOCK    ← never auto-approve critical
```

### 4.3 Vault Design

- Cipher: XChaCha20-Poly1305 (256-bit key, 24-byte nonce)
- Key storage: `vault.key` file, owner-only permissions (mode 0o600)
- Data storage: `vault.enc` JSON file, encrypted values as hex strings
- Write safety: atomic write-then-rename (`vault.enc.tmp` → `vault.enc`)
- Format: `ENC:` prefix + hex(nonce + ciphertext)

### 4.4 Injection Scanner Design

Aho-Corasick automaton for O(n) multi-pattern matching:

```
Input text
    │
    ▼
Normalize Unicode (Cyrillic → Latin)
    │
    ▼
Strip zero-width characters (\u200B, \u200C, \u200D, \uFEFF, \u00AD)
    │
    ▼
Lowercase
    │
    ▼
Aho-Corasick scan against 30+ markers
    │
    ▼
Score: matches found → action
  0     → clean
  1     → flag (log only)
  2-3   → sanitize (redact matches)
  4+    → block (reject entirely)
```

Marker categories:
- **Role override:** "ignore previous instructions", "ignore all previous", "disregard above"
- **Identity swap:** "you are now", "new role", "act as"
- **System prompt:** "system prompt", "system:", "<|system|>"
- **Instruction override:** "new instructions", "override instructions"
- **Social engineering:** "the developer said", "admin override", "maintenance mode"
- **Encoding evasion:** "aWdub3Jl" (base64 "ignore"), "ZGlzcmVnYXJk" (base64 "disregard")
- **Roleplay:** "pretend you are", "imagine you're a", "roleplay as"

## 5. Memory Design

### 5.1 MemCell

```typescript
interface MemCell {
  id: string;             // UUID
  episode: string;        // Natural language description
  facts: string[];        // Extracted key facts
  tags: string[];         // Categorical tags
  timestamp: string;      // ISO 8601
  foresight?: Foresight;  // Predictive note with expiry
  checksum: string;       // SHA-256 of canonical form
}
```

Checksum computed over `{ episode, facts (sorted), tags (sorted) }` to detect tampering.

### 5.2 MemScene Consolidation

Jaccard similarity between tag sets:

```
J(A, B) = |A ∩ B| / |A ∪ B|
```

If J >= 0.3, the MemCell is added to the existing scene. Otherwise, a new scene is created.

Scene summary is built by accumulating facts from all cells (not replacing).

### 5.3 Recall Pipeline

```
Query
  │
  ├──► BM25 search (with stemming + stop words)
  │       │
  │       ├──► Ranked list A
  │       │
  ├──► TF-IDF + Cosine similarity
  │       │
  │       ├──► Ranked list B
  │       │
  └──► Reciprocal Rank Fusion (k=60)
          │
          ▼
      Fused ranking
```

### 5.4 BM25 Tokenization

```
Input: "The authentication system handles user sessions"
  │
  ▼ lowercase
"the authentication system handles user sessions"
  │
  ▼ split on \W+
["the", "authentication", "system", "handles", "user", "sessions"]
  │
  ▼ filter stop words (88 words: "the" removed)
["authentication", "system", "handles", "user", "sessions"]
  │
  ▼ Porter stemming
["authenticat", "system", "handl", "user", "session"]
```

This enables morphological matching: "authenticated" and "authentication" both stem to "authenticat".

## 6. Mode Design

### 6.1 Base Mode Contract

```typescript
abstract class BaseMode {
  abstract name: string;
  abstract slug: string;
  abstract instructions: string;
  abstract allowedTools: string[];
  abstract autonomyLevel: AutonomyLevel;

  memoryDepth: "summary" | "full" = "summary";
  planningEnabled = false;
  notebookId?: string;

  buildSystemPrompt(ctx: ModeContext): string;
}
```

### 6.2 Custom Mode YAML Schema

```yaml
name: string           # Display name
slug: string           # Unique identifier
extends?: BuiltInSlug  # Inherit from built-in
autonomy?: AutonomyLevel
memory?: "summary" | "full"
planning?: boolean
notebook_id?: string
instructions: string   # System prompt additions
allowedTools?: string[]
```

### 6.3 Mode Detection

Heuristic keyword matching on user message:
- "debug", "fix", "error" → debug
- "plan", "roadmap", "milestone" → plan
- "review", "audit" → review
- "design", "architect" → architect
- "explain", "what is", "how does" → ask
- Default → code

## 7. Context Assembly

### 7.1 Token Budget

Total budget: 3000 tokens (estimated at 4 chars/token = 12K chars).

Priority order for truncation:
1. Mode instructions (never truncated)
2. Profile context
3. Memory context
4. RAG context
5. Plan context (first to be truncated)

### 7.2 Sanitization Pipeline

All context content passes through:
1. `scanForInjection()` — Score injection risk
2. `isConfidentialContent()` — Detect API keys, tokens, etc.
3. `redactConfidential()` — Replace with `[REDACTED]`
4. Optional: wrap in `<context>` delimiters

## 8. Hook Protocol

### 8.1 Registration

`hooks/hooks.json` registers 6 hook types with wildcard matcher:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "*", "command": "bun run src/hooks/cli.ts PreToolUse" }],
    "PostToolUse": [{ "matcher": "*", "command": "bun run src/hooks/cli.ts PostToolUse" }],
    "Stop": [{ "matcher": "*", "command": "bun run src/hooks/cli.ts Stop" }],
    "Notification": [{ "matcher": "*", "command": "bun run src/hooks/cli.ts Notification" }],
    "PreCompact": [{ "matcher": "*", "command": "bun run src/hooks/cli.ts PreCompact" }],
    "SessionEnd": [{ "matcher": "*", "command": "bun run src/hooks/cli.ts SessionEnd" }]
  }
}
```

### 8.2 CLI Dispatcher

`src/hooks/cli.ts` handles the stdin/stdout JSON protocol:

1. Read hook type from argv[2]
2. Read JSON payload from stdin
3. Validate payload shape (`validatePreToolInput` / `validatePostToolInput`)
4. Dispatch to appropriate handler
5. Write JSON response to stdout

Invalid payloads → stderr message + exit code 2.

### 8.3 PreToolUse Output Format

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": ""
  }
}
```

Decision mapping: block→"deny", confirm→"ask", allow→"allow".

## 9. RAG Design

### 9.1 Connector Strategies

Tried in order: MCP → Python → API → none.

```typescript
type ConnectorStrategy = "mcp" | "python" | "api" | "none";
```

Circuit breaker wraps strategy execution:
- Failure threshold: 3
- Reset timeout: 60 seconds
- States: closed → open → half_open

### 9.2 Cache

- TTL: 7 days
- Fuzzy matching: BM25 search with threshold 0.5
- IDs: SHA-256 hash of `"${mode}:${query}"`, truncated to 16 hex chars
- Storage: Single JSON file in `rag-cache/` directory

## 10. Testing Strategy

### 10.1 Coverage

- 46 source files → 42 test files
- 266 tests, 603 assertions
- Every security module has mandatory tests
- Integration test covers full PreToolUse → PostToolUse pipeline

### 10.2 Conventions

- Mirror `src/` structure in `test/`
- One test file per source module
- Temp dirs via `mkdtemp()` with module-specific prefix
- Cleanup with `rm(dir, { recursive: true, force: true })`
- Always `await` async operations in tests
- No mocking of core security functions (test real behavior)

## 11. Future Work

Identified but not yet implemented:

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | MCP Server | Expose security kernel as reusable MCP server (stdio transport, 6 read-only tools) |
| P1 | Hybrid retrieval | Connect vector similarity signal to existing RRF infrastructure |
| P1 | Observer/Reflector | Memory consolidation patterns for long sessions |
| P2 | Importance-weighted decay | Time-based memory relevance scoring |
| P2 | GoalGuard | Goal-constraint enforcement layer |
| P3 | EU AI Act report | Auto-generate compliance reports from audit logs |
| P3 | Memory isolation | Per-user/per-project memory partitioning |

## 12. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-03 | XChaCha20-Poly1305 over AES-GCM | Longer nonce (24 vs 12 bytes) eliminates nonce-reuse risk |
| 2026-03-03 | Aho-Corasick over regex | O(n) vs O(n*m) for multi-pattern matching |
| 2026-03-03 | BM25 over embedding search | Zero dependencies, no API calls, deterministic |
| 2026-03-03 | Jaccard over cosine for clustering | Simpler, works well for tag-based grouping |
| 2026-03-03 | 2 deps maximum | Minimize supply chain attack surface |
| 2026-03-04 | Autonomous blocks critical | Even max autonomy should never auto-approve destructive commands |
| 2026-03-04 | Atomic vault writes | Prevent corruption from process crashes mid-write |
| 2026-03-04 | Porter stemmer (simplified) | Full Porter has 60+ rules; 14 suffice for recall improvement |
| 2026-03-04 | hookSpecificOutput format | Conform to Claude Code plugin spec for PreToolUse responses |
| 2026-03-04 | Memory write injection scanning | Prevent poisoning via external content persisted to memory |
