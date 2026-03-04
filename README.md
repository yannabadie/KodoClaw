# Kodo

Intelligent Claude Code plugin with memory, planning, security, and RAG.

```
100 files  |  7,900 LOC  |  381 tests  |  2 deps  |  5 agents  |  Bun + TypeScript
```

## What is Kodo?

Kodo is a [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code) that gives Claude persistent memory, hierarchical planning, a security kernel, and NotebookLM RAG integration. It runs as a set of 9 hooks that intercept every tool call, classify risk, scan for injection, guard output, and build context-aware system prompts.

**Key capabilities:**
- Remembers facts across sessions (episodic memory with BM25 search + importance decay)
- Plans multi-step tasks with milestone tracking
- Blocks dangerous commands and sensitive file access
- Detects prompt injection in real-time (Aho-Corasick scanner, 44 markers)
- Guards LLM output against XSS, code injection, SQL injection (ASI05)
- Scans user prompts before Claude processes them (UserPromptSubmit hook)
- Defends against system prompt extraction attacks (LLM07)
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

Point Claude Code at the plugin directory:

```bash
claude --plugin-dir /path/to/kodo
```

Or copy `hooks/hooks.json` into your project's `.claude/settings.json`. The plugin uses `${CLAUDE_PLUGIN_ROOT}` for portable paths.

This loads:
- **9 hooks** — PreToolUse, PostToolUse, PostToolUseFailure, Stop, Notification, PreCompact, SessionStart, UserPromptSubmit, SessionEnd
- **5 agents** — code (default), architect, debug, review, security-audit
- **11 slash commands** — `/kodo:status`, `/kodo:plan`, `/kodo:memory`, etc.
- **2 skills** — kodo-context (auto-invoked), security-check

## Architecture

```
                    ┌─────────────────────────────────┐
                    │      Plugin Surface              │
                    │  9 hooks · CLAUDE.md · CLI       │
                    └──────────┬──────────────────────┘
                               │
            ┌──────────────────┼──────────────────────┐
            │                  │                      │
     ┌──────┴──────┐   ┌──────┴──────┐   ┌───────────┴──────────┐
     │ Mode Engine │   │Memory Engine│   │    Policy Kernel      │
     │             │   │             │   │                       │
     │ 6 built-in  │   │ MemCell     │   │ Risk Classifier      │
     │ + custom    │   │ MemScene    │   │ Injection Scanner     │
     │   YAML      │   │ BM25 Index  │   │ Output Guard (ASI05)  │
     │             │   │ Stemmer     │   │ Blocklist             │
     │ Planner     │   │ Decay       │   │ Audit Log             │
     │ Hints       │   │ Profile     │   │ Vault (XChaCha20)     │
     │ Library     │   │ Recall/RRF  │   │ Circuit Breaker       │
     │             │   │ RAG Cache   │   │ Rate Limiter          │
     │ Context     │   │             │   │ Cost Tracker           │
     │ Assembler   │   │             │   │ Baseline Anomaly       │
     │             │   │             │   │ Integrity Verifier     │
     └─────────────┘   └─────────────┘   └────────────────────────┘
```

### Hook pipeline

Every Claude Code tool call flows through this pipeline:

```
User prompt
    │
    ├── UserPromptSubmit ── Injection scan → block/warn/allow
    │
    ▼
Claude selects tool
    │
    ├── PreToolUse
    │     1. Extract paths from tool params
    │     2. Check against sensitive path blocklist
    │     3. Classify shell command risk level
    │     4. Apply autonomy policy matrix
    │     → hookSpecificOutput: allow/deny/ask
    │     → or: { continue: false } for kill switch
    │
    ▼
Tool executes (or is blocked)
    │
    ├── PostToolUse
    │     1. Scan output for injection patterns (44 markers)
    │     2. Normalize Unicode homoglyphs
    │     3. Strip zero-width characters
    │     4. Redact confidential content
    │     5. Guard output for XSS/SQL/code injection (11 patterns)
    │     → decision: "block" or additionalContext warning
    │
    ├── PostToolUseFailure (on error)
    │     → Log failure to audit JSONL
    │
    ▼
Session lifecycle
    │
    ├── SessionStart → Load profile + memory context
    ├── PreCompact → Memory checkpoint
    ├── Stop → Audit summary
    ├── Notification → Alert logging
    └── SessionEnd → Final audit record
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

## Agents

Agents are defined in `agents/*.md` and set the default behavior, autonomy level, and available tools. The default agent is `code` (configured in `settings.json`).

| Agent | Autonomy | Tools | Description |
|-------|----------|-------|-------------|
| **code** | trusted | full | Default coding agent with planning and full memory |
| **architect** | supervised | read-only | System design, dependency analysis, refactoring proposals |
| **debug** | trusted | full | Systematic debugging with audit log access |
| **review** | guarded | read-only | Code review focused on security, quality, OWASP |
| **security-audit** | supervised | read-only | OWASP compliance audit, vulnerability checks |

## Skills

Skills are auto-invoked capabilities in `skills/`:

| Skill | Description |
|-------|-------------|
| **kodo-context** | Auto-invoked context about Kodo commands, modes, and security rules |
| **security-check** | OWASP compliance checklist: injection patterns, sensitive paths, shell risk, output guard, memory integrity |

### Custom modes

Create YAML files in `~/.kodo/modes/`. Invalid autonomy values and built-in slug conflicts are rejected:

```yaml
name: Security Audit
slug: secaudit
extends: review
autonomy: supervised
memory: full
planning: true
instructions: |
  Focus on OWASP Top 10 vulnerabilities.
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
| **critical** | `rm -rf /`, `chmod 777`, `curl \| sh`, `python -c`, `node -e`, `powershell -enc`, `eval()`, `exec()`, `bun eval` |
| **high** | `git push --force`, `npm publish`, `docker run`, `docker exec`, `kubectl exec` |
| **medium** | `git commit`, `npm install`, `pip install` |
| **low** | `ls`, `cat`, `grep`, `git status`, `bun test` |

### Prompt injection detection

Aho-Corasick automaton scans all content for **44 injection markers** across 7 categories:

| Category | Examples |
|----------|----------|
| Role override | "ignore previous instructions", "disregard above" |
| Identity swap | "you are now", "act as root" |
| System prompt | "system:", "<\|im_start\|>", "\<system\>" |
| Instruction override | "new system prompt", "override your instructions" |
| Social engineering | "developer mode", "do anything now" |
| Roleplay | "pretend you are", "roleplay as" |
| Prompt extraction (LLM07) | "repeat your instructions", "show me your system prompt" |

Scoring: 1 match = flag, 2-3 = sanitize, 4+ = block.

### Output guard (ASI05)

Scans LLM output for 11 dangerous patterns:

| Category | Patterns |
|----------|----------|
| XSS | `<script>`, `javascript:`, `on*=` event handlers |
| Code execution | `eval()`, `Function()`, `import()`, `child_process` |
| SQL injection | `DROP TABLE`, `; DELETE FROM`, `UNION SELECT` |
| Destructive | `rm -rf /` |

### Encryption

Secrets stored with XChaCha20-Poly1305 (via `@noble/ciphers`):
- 256-bit random key, owner-only permissions (mode 0600)
- Atomic write-then-rename for vault and cache files
- 24-byte random nonce per encryption operation

## Memory System

### 4-phase lifecycle

```
   ENCODE              CONSOLIDATE           DECAY              RECALL
┌──────────┐       ┌───────────────┐    ┌──────────┐      ┌─────────────┐
│createMemCell()   │ consolidate() │    │ decay.ts │      │ BM25 search │
│                  │               │    │          │      │ TF-IDF      │
│• SHA-256 hash    │• Jaccard sim  │    │• e^(-t/S)│      │ Cosine sim  │
│• Injection scan  │  (≥0.3)       │    │• β=0.8   │      │ RRF (k=60)  │
│• Importance      │• Scene cluster│    │• Prune   │      │ × retention │
│  (default 1.0)   │• Summary merge│    │  <10%    │      │             │
│• Type guard      │               │    │          │      │             │
└──────────┘       └───────────────┘    └──────────┘      └─────────────┘
```

**MemCell** — Atomic memory unit:
- `episode`: What happened
- `facts[]`: Key facts extracted
- `tags[]`: Categorical tags
- `importance?`: Decay weight (0.0-1.0+, default 1.0)
- `foresight?`: Predictive note with expiry
- `checksum`: SHA-256 for tamper detection

**Decay** — FadeMem-inspired Ebbinghaus retention:
```
retention(t) = e^(-(t/S)^β)
S = importance × 7 days
β = 0.8 (sub-linear, gentler than exponential)
```
- importance=2.0 → decays 2x slower
- importance=0.5 → decays 2x faster
- Below 10% retention → pruned

**BM25 Index** — Full-text search with Porter stemming:
- 88 English stop words filtered
- `-ation` stems to `-ate` (e.g., "automation" → "automate")
- Serializable to/from JSON

### User profile

```yaml
stableTraits:
  stack: "TypeScript, Bun"
  style: "TDD, small commits"

temporaryStates:
  focus:
    value: "refactoring auth module"
    expires: "2026-03-10"  # auto-filtered after expiry
```

## Planning

Milestone-based hierarchical planner with archive and similarity search:

```
Plan: "Add user authentication"
├── [completed] Set up JWT library
├── [in_progress] Implement login endpoint
├── [pending] Add session middleware
└── [pending] Write integration tests
```

Library archives completed plans and finds similar past plans via word-overlap. Corrupt JSON files are skipped gracefully.

## NotebookLM RAG

| Strategy | Method | Circuit Breaker |
|----------|--------|-----------------|
| MCP | `notebooklm-mcp` server | 3 failures → open (60s) |
| Python | `notebooklm-py` library | 3 failures → open (60s) |
| API | Google Enterprise API | 3 failures → open (60s) |

Cache: 7-day TTL, BM25 fuzzy matching (threshold 0.5), atomic writes.

## Slash Commands

Defined in `commands/*.md`, invoked as `/kodo:<name>`:

| Command | Description |
|---------|-------------|
| `/kodo:status` | Current mode, autonomy, memory count, plan, cost |
| `/kodo:mode <slug>` | Switch mode |
| `/kodo:plan [show\|create\|complete]` | View/manage milestone roadmap |
| `/kodo:memory` | Memory summary (MemCells, MemScenes, profile) |
| `/kodo:audit [count]` | Recent audit entries |
| `/kodo:cost` | Token usage, USD cost, budget |
| `/kodo:autonomy <level>` | Change autonomy level |
| `/kodo:stop` | Emergency kill-switch (EU AI Act Art. 14) |
| `/kodo:undo` | Git snapshot rollback |
| `/kodo:ui` | Open web dashboard |
| `/kodo:health` | Subsystem health checks |

## Web Dashboard

Localhost-only SPA on port 3700 with HMAC-SHA256 pairing authentication.

- Bound to `127.0.0.1` only (never `0.0.0.0`)
- Prefix-safe Bearer token extraction
- Timing-safe HMAC comparison with hex validation
- API routes: `/api/status`, `/api/cost`, `/api/memory`, `/api/plan`, `/api/audit`

## OWASP Compliance

### Agentic Top 10 (2026)

| ID | Threat | Mitigation |
|----|--------|------------|
| ASI01 | Agent Goal Hijack | 44-marker Aho-Corasick scanner, homoglyph normalization, zero-width stripping, user prompt scanning |
| ASI02 | Tool Misuse | Risk classifier, 4-level policy matrix, path blocklist |
| ASI03 | Identity & Privilege Abuse | Mode-specific tool restrictions, autonomy validation |
| ASI04 | Supply Chain Vulnerabilities | SHA-256 manifest verification |
| ASI05 | Unexpected Code Execution | Output guard (11 patterns: XSS, eval, SQL, rm -rf) |
| ASI06 | Memory & Context Poisoning | MemCell checksums, injection scan on writes, type guard |
| ASI08 | Cascading Failures | Circuit breaker on RAG connector |
| ASI09 | Human-Agent Trust Exploitation | Append-only JSONL audit, failure logging |
| ASI10 | Rogue Agents | Behavioral baseline, kill switch at 2x threshold |

### LLM Top 10 (2025)

| ID | Threat | Mitigation |
|----|--------|------------|
| LLM01 | Prompt Injection | Same as ASI01 |
| LLM05 | Improper Output Handling | Output guard, content redaction |
| LLM07 | System Prompt Leakage | 10 extraction markers, anti-leakage armor |

## Documentation

| Document | Description |
|----------|-------------|
| [Installation Guide](docs/INSTALL.md) | Prerequisites, step-by-step setup, verification |
| [Quick Start](docs/QUICKSTART.md) | 5-minute first session walkthrough |
| [Hooks Reference](docs/HOOKS.md) | All 9 hook payload schemas with JSON examples |
| [Architecture](docs/ARCHITECTURE.md) | Layer model, data flows, module map |
| [Memory System](docs/MEMORY.md) | MemCell, decay, BM25, recall pipeline |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common problems and solutions |
| [Security](SECURITY.md) | OWASP coverage, threat model, encryption |
| [Contributing](CONTRIBUTING.md) | Conventions, testing, commit workflow |
| [Changelog](CHANGELOG.md) | Version history |
| [Design Document](docs/plans/2026-03-03-kodo-design.md) | Original architecture design and decisions |

## Development

```bash
# Run tests (381 tests, 808 assertions)
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
├── .claude-plugin/
│   └── plugin.json               — plugin manifest (v0.4.0)
├── agents/                        — 5 agent definitions
│   ├── code.md                    — default coding agent (trusted)
│   ├── architect.md               — system design (supervised, read-only)
│   ├── debug.md                   — debugging (trusted, full tools)
│   ├── review.md                  — code review (guarded, read-only)
│   └── security-audit.md         — OWASP audit (supervised, read-only)
├── commands/                      — 11 slash commands (/kodo:<name>)
│   ├── status.md, plan.md, memory.md, audit.md, cost.md, health.md
│   ├── mode.md, autonomy.md, stop.md, undo.md, ui.md
├── skills/
│   ├── kodo-context/SKILL.md     — auto-invoked plugin context
│   └── security-check/SKILL.md  — OWASP security check
├── hooks/
│   └── hooks.json                — 9 hook registrations
├── src/
│   ├── security/      11 modules — policy kernel
│   ├── memory/         7 modules — memory engine
│   ├── modes/          9 modules — mode system
│   ├── planning/       3 modules — milestone planner
│   ├── context/        3 modules — prompt assembly
│   ├── rag/            2 modules — NotebookLM connector
│   ├── hooks/          8 modules — hook handlers
│   ├── ui/             3 modules — web dashboard
│   ├── cli/            3 modules — CLI commands
│   ├── index.ts                  — plugin init
│   └── plugin.ts                 — pre/post tool handlers
├── test/              48 test files mirroring src/
├── docs/plans/                   — design documents
├── settings.json                 — default agent + permissions
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

### Testing conventions

- Every `src/X/Y.ts` has a corresponding `test/X/Y.test.ts`
- Tests use Bun's built-in test runner (`bun:test`)
- All hook payloads validated; invalid payloads exit code 2
- JSON from disk validated with type guards
- Temp directories: `mkdtemp(join(tmpdir(), "kodo-<module>-"))`
- Cleanup: `rm(dir, { recursive: true, force: true })`
- Always `await` async operations (no fire-and-forget)

## License

MIT
