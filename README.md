# Kodo

Intelligent Claude Code plugin with memory, planning, security, and RAG.

```
88 files  |  6,145 LOC  |  266 tests  |  2 deps  |  Bun + TypeScript
```

## What is Kodo?

Kodo is a [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code) that gives Claude persistent memory, hierarchical planning, a security kernel, and NotebookLM RAG integration. It runs as a set of hooks that intercept every tool call, classify risk, scan for injection, and build context-aware system prompts.

**Key capabilities:**
- Remembers facts across sessions (episodic memory with BM25 search)
- Plans multi-step tasks with milestone tracking
- Blocks dangerous commands and sensitive file access
- Detects prompt injection in real-time (Aho-Corasick scanner)
- Encrypts secrets at rest (XChaCha20-Poly1305)
- Queries NotebookLM for domain-specific context
- Tracks token costs and enforces budgets
- Provides a localhost web dashboard

## Quick Start

```bash
# Install dependencies
bun install

# Run tests
bun test

# Lint & format
bun run check
```

### Install as Claude Code plugin

Copy `hooks/hooks.json` into your project's `.claude/settings.json` or merge the hooks section:

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

## Architecture

```
                    ┌─────────────────────────────────┐
                    │      Plugin Surface              │
                    │  hooks.json · CLAUDE.md · CLI    │
                    └──────────┬──────────────────────┘
                               │
            ┌──────────────────┼──────────────────────┐
            │                  │                      │
     ┌──────┴──────┐   ┌──────┴──────┐   ┌───────────┴──────────┐
     │ Mode Engine │   │Memory Engine│   │    Policy Kernel      │
     │             │   │             │   │                       │
     │ 6 built-in  │   │ MemCell     │   │ Risk Classifier      │
     │ + custom    │   │ MemScene    │   │ Injection Scanner     │
     │   YAML      │   │ BM25 Index  │   │ Blocklist             │
     │             │   │ Stemmer     │   │ Audit Log             │
     │ Planner     │   │ Profile     │   │ Vault (XChaCha20)     │
     │ Hints       │   │ Recall/RRF  │   │ Circuit Breaker       │
     │ Library     │   │ RAG Cache   │   │ Rate Limiter          │
     │             │   │             │   │ Cost Tracker           │
     │ Context     │   │             │   │ Baseline Anomaly       │
     │ Assembler   │   │             │   │ Integrity Verifier     │
     └─────────────┘   └─────────────┘   └────────────────────────┘
```

### Hook pipeline

Every Claude Code tool call flows through this pipeline:

```
User prompt → Claude selects tool
                    │
            ┌───────▼────────┐
            │  PreToolUse    │  ← Reads JSON from stdin
            │                │
            │ 1. Extract paths from tool params
            │ 2. Check against sensitive path blocklist
            │ 3. Classify shell command risk level
            │ 4. Apply autonomy policy matrix
            │                │
            │  Output: hookSpecificOutput
            │  { permissionDecision: allow|deny|ask }
            └───────┬────────┘
                    │
            Tool executes (or is blocked)
                    │
            ┌───────▼────────┐
            │  PostToolUse   │
            │                │
            │ 1. Scan output for injection patterns
            │ 2. Normalize Unicode homoglyphs
            │ 3. Strip zero-width characters
            │ 4. Redact confidential content
            │ 5. Return injection score + sanitized output
            └────────────────┘
```

## Modes

| Mode | Slug | Autonomy | Memory | Planning | Tools |
|------|------|----------|--------|----------|-------|
| Code | `code` | trusted | summary | yes | bash, read, write, edit, glob, grep, agent |
| Architect | `architect` | supervised | full | yes | read, glob, grep, agent |
| Ask | `ask` | guarded | summary | no | read, glob, grep |
| Debug | `debug` | trusted | full | yes | bash, read, write, edit, glob, grep, agent |
| Plan | `plan` | guarded | summary | yes | read, glob, grep, agent |
| Review | `review` | guarded | summary | no | read, glob, grep |

### Custom modes

Create YAML files in `~/.kodo/modes/`:

```yaml
name: Security Audit
slug: secaudit
extends: review
autonomy: supervised
memory: full
planning: true
instructions: |
  Focus on OWASP Top 10 vulnerabilities.
  Check for injection, XSS, CSRF, and auth issues.
allowedTools:
  - read
  - glob
  - grep
```

## Security Model

### Autonomy levels

| Level | Low risk | Medium risk | High risk | Critical risk |
|-------|----------|-------------|-----------|---------------|
| **guarded** | confirm | confirm | block | block |
| **supervised** | allow | confirm | confirm | block |
| **trusted** | allow | allow | confirm | block |
| **autonomous** | allow | allow | allow | **block** |

Critical commands are **always blocked**, even in autonomous mode.

### Shell risk classification

| Risk | Examples |
|------|----------|
| **critical** | `rm -rf /`, `chmod 777`, `curl \| sh`, `python -c`, `node -e`, `powershell -enc`, `eval()`, `exec()` |
| **high** | `git push --force`, `npm publish`, `docker run`, `docker exec`, `kubectl exec` |
| **medium** | `git commit`, `npm install`, `pip install` |
| **low** | `ls`, `cat`, `grep`, `git status`, `bun test` |

### Protected paths

These paths are **always blocked** for read/write/edit/glob/grep:

- `.env`, `.env.*` files
- `.ssh/` directory
- `credentials.json`, `secrets.yaml`, `*.pem`, `*.key`
- `id_rsa`, `id_ed25519`, `authorized_keys`
- `~/.aws/credentials`, `~/.config/gcloud/`

### Prompt injection detection

Aho-Corasick automaton scans all external content for 30+ injection markers:

- Role manipulation: "ignore previous instructions", "you are now", "new instructions"
- Encoding evasion: Base64 `aWdub3Jl`, Unicode homoglyphs, zero-width characters
- Roleplay attacks: "pretend you are", "imagine you're", "roleplay as"
- Social engineering: "the developer said", "admin override", "maintenance mode"

Scoring: 1 match = flag, 2 = sanitize, 4+ = block.

### Encryption

Secrets stored with XChaCha20-Poly1305 (via `@noble/ciphers`):
- 256-bit random key generated on first init
- Key file restricted to owner-only permissions (mode 0600)
- Vault file uses atomic write-then-rename to prevent corruption
- 24-byte random nonce per encryption operation

## Memory System

### 3-phase lifecycle

```
      ENCODE                    CONSOLIDATE                 RECALL
  ┌────────────┐           ┌──────────────────┐       ┌─────────────┐
  │ createMemCell()        │ consolidate()     │       │ BM25 search │
  │                        │                   │       │ TF-IDF      │
  │ • SHA-256 checksum     │ • Jaccard sim     │       │ Cosine sim  │
  │ • Injection scan       │   (threshold 0.3) │       │ RRF fusion  │
  │ • Foresight (optional) │ • Scene clustering│       │ (k=60)      │
  │ • Persist to disk      │ • Summary merge   │       │             │
  └────────────┘           └──────────────────┘       └─────────────┘
```

**MemCell** — Atomic memory unit:
- `episode`: What happened (natural language)
- `facts[]`: Extracted key facts
- `tags[]`: Categorical tags for clustering
- `foresight?`: Predictive note with expiry date
- `checksum`: SHA-256 for tamper detection

**MemScene** — Cluster of related MemCells:
- Grouped by Jaccard tag similarity (>= 0.3)
- Summary built from accumulated facts
- Crypto-safe IDs via `randomUUID()`

**BM25 Index** — Full-text search:
- Porter stemming reduces morphological variants ("authentication" matches "authenticated")
- 88 English stop words filtered out
- Serializable to/from JSON for persistence

### User profile

Tracks stable traits and temporary states:

```yaml
stableTraits:
  stack: "TypeScript, Bun"
  style: "TDD, small commits"
  language: "French"

temporaryStates:
  focus:
    value: "refactoring auth module"
    expires: "2026-03-10"
```

## Planning

Milestone-based hierarchical planner:

```
Plan: "Add user authentication"
├── [completed] Set up JWT library
├── [in_progress] Implement login endpoint
├── [pending] Add session middleware
└── [pending] Write integration tests
```

Features:
- `createPlan(task, goals)` — Create milestone roadmap
- `generateHint(milestone, context)` — Contextual step-by-step hints
- `MilestoneLibrary` — Archive past plans for similarity search

## NotebookLM RAG

Three connector strategies (auto-detected):

| Strategy | Method | Requirements |
|----------|--------|--------------|
| MCP | `notebooklm-mcp` server | MCP server configured |
| Python | `notebooklm-py` library | Python + notebooklm package |
| API | Google Enterprise API | API key in vault |

Features:
- Circuit breaker: 3 failures → open (60s cooldown)
- Cache: 7-day TTL with BM25 fuzzy matching (threshold 0.5)
- Stable hash IDs (SHA-256) for cache entries

## CLI Commands

| Command | Description |
|---------|-------------|
| `/kodo status` | Current mode, autonomy, memory count |
| `/kodo mode <slug>` | Switch mode |
| `/kodo plan` | View milestone roadmap |
| `/kodo memory` | Memory summary |
| `/kodo audit` | Recent audit entries |
| `/kodo cost` | Token cost tracking |
| `/kodo autonomy <level>` | Change autonomy level |
| `/kodo stop` | Emergency kill-switch |
| `/kodo undo` | Restore last git snapshot |
| `/kodo ui` | Open web dashboard |
| `/kodo health` | Run health checks |

## Web Dashboard

Localhost-only SPA served on port 3700 with HMAC-SHA256 pairing authentication.

```
GET /            → Dashboard HTML
GET /api/status  → { mode, autonomy, memoryCount, planProgress }
GET /api/cost    → { sessionCost, dailyCost }
GET /api/memory  → { cells, scenes }
GET /api/plan    → { milestones, progress }
GET /api/audit   → { entries }
```

Security:
- Bound to `127.0.0.1` only (never `0.0.0.0`)
- All `/api/*` routes require valid session token
- Pairing tokens expire (configurable TTL)
- Timing-safe HMAC comparison with hex validation

## Context Assembly

6-step pipeline with 3000-token budget (12K chars):

1. Mode instructions (highest priority)
2. User profile context
3. Memory context (MemCells + Scenes)
4. RAG context (NotebookLM answers)
5. Plan context (milestones + hints)
6. Truncation to budget

Content is sanitized (injection scan + confidential redaction) before inclusion.

## OWASP Agentic 2026 Compliance

| ID | Threat | Kodo Mitigation |
|----|--------|-----------------|
| ASI01 | Prompt Injection | Aho-Corasick scanner, homoglyph normalization, zero-width stripping |
| ASI02 | Tool Misuse | Risk classifier, 4-level policy matrix, path blocklist |
| ASI03 | Excessive Authority | Mode-specific tool restrictions, autonomy levels |
| ASI04 | Skill Integrity | SHA-256 manifest verification |
| ASI06 | Memory Poisoning | MemCell checksums, injection scanning on writes |
| ASI08 | Cascading Failures | Circuit breaker on RAG connector |
| ASI09 | Insufficient Logging | Append-only JSONL audit, daily rotation |
| ASI10 | Anomaly Detection | Behavioral baseline, kill switch at 2x threshold |

## Development

```bash
# Run tests (266 tests, 603 assertions)
bun test

# Lint & format check (zero errors required)
bun run check

# Auto-fix lint issues
bun run check:fix

# Build
bun run build
```

### Project structure

```
kodo/
├── src/
│   ├── security/      10 modules — policy kernel
│   ├── memory/         6 modules — memory engine
│   ├── modes/          9 modules — mode system
│   ├── planning/       3 modules — milestone planner
│   ├── context/        3 modules — prompt assembly
│   ├── rag/            2 modules — NotebookLM connector
│   ├── hooks/          5 modules — hook handlers
│   ├── ui/             3 modules — web dashboard
│   ├── cli/            3 modules — CLI commands
│   ├── index.ts                  — plugin init
│   └── plugin.ts                 — pre/post tool handlers
├── test/              42 test files mirroring src/
├── hooks/
│   └── hooks.json                — Claude Code hook registration
├── CLAUDE.md                     — AI instructions
├── biome.json                    — lint/format config
├── tsconfig.json                 — TypeScript strict config
└── package.json                  — 2 runtime deps
```

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@noble/ciphers` | ^1.2.0 | XChaCha20-Poly1305 encryption |
| `yaml` | ^2.7.0 | YAML parsing for custom modes |

No other runtime dependencies allowed without design review.

Dev dependencies: `@biomejs/biome` ^1.9.0, `@types/bun`.

### Testing conventions

- Every `src/X/Y.ts` has a corresponding `test/X/Y.test.ts`
- Tests use Bun's built-in test runner (`bun:test`)
- Temp directories: `mkdtemp(join(tmpdir(), "kodo-<module>-"))`
- Cleanup: `rm(dir, { recursive: true, force: true })` in `afterEach`
- Always `await` async operations (no fire-and-forget)
- Security tests are mandatory for any security module change

## Configuration

Default config (`~/.kodo/config.yaml`):

```yaml
# Kodo Configuration
autonomy: trusted
default_mode: code
ui_port: 3700
```

Runtime data directories (created at plugin root, gitignored):
- `audit/` — Daily JSONL audit logs
- `memory/` — MemCells, MemScenes, profile, compaction checkpoints
- `plans/` — Archived milestone plans
- `rag-cache/` — NotebookLM query cache
- `modes/` — Custom mode YAML files

## License

MIT
