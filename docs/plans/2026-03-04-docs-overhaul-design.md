# Documentation Overhaul Design

> **Status:** Approved
> **Created:** 2026-03-04
> **Goal:** Exhaustive, precise documentation for mass adoption — for both AI and humans. Verifiable and testable via smoke test script.

## 1. Audience

Both AI and human audiences equally:
- **Humans**: INSTALL, QUICKSTART, CONTRIBUTING, TROUBLESHOOTING, SECURITY
- **AI**: Enriched CLAUDE.md with hook payload schemas, formal verification rules
- **Both**: HOOKS.md, ARCHITECTURE.md, MEMORY.md with precise schemas and examples

## 2. Language

English (standard open-source, maximizes international adoption).

## 3. Verification

Automated smoke test script (`scripts/smoke-test.sh`) that verifies every installation step. Executable by humans and CI.

## 4. File Plan

```
kodo/
├── LICENSE                         — MIT license text
├── CHANGELOG.md                   — Version history (0.1.0 → 0.3.0)
├── SECURITY.md                    — Root-level (GitHub auto-detects)
├── CONTRIBUTING.md                — Root-level (GitHub auto-detects)
├── scripts/
│   └── smoke-test.sh              — Automated verification (12 checks)
├── docs/
│   ├── INSTALL.md                 — Prerequisites + step-by-step + verification
│   ├── QUICKSTART.md              — 5-minute first session walkthrough
│   ├── HOOKS.md                   — All 9 hook payload schemas + JSON examples
│   ├── ARCHITECTURE.md            — Module map, data flows, layer model
│   ├── MEMORY.md                  — Memory lifecycle, decay, BM25, recall
│   ├── TROUBLESHOOTING.md         — FAQ + common errors + solutions
│   └── plans/                     — Existing design docs (unchanged)
├── CLAUDE.md                      — Enriched: hook schemas, doc links
└── README.md                      — Updated: Documentation section with links
```

## 5. Content Per File

### 5.1 docs/INSTALL.md
- Prerequisites: Bun >= 1.0, Git, OS (macOS/Linux/Windows)
- Step 1: Clone repository
- Step 2: Install dependencies (`bun install`)
- Step 3: Run tests (`bun test` → 338 pass, 0 fail)
- Step 4: Lint check (`bun run check` → 0 errors)
- Step 5a: Integration via `claude --plugin-dir`
- Step 5b: Integration via settings.json merge
- Step 6: Verify hooks fire (`/kodo:status`)
- Each step has "Expected output" block

### 5.2 docs/QUICKSTART.md
- First launch with plugin loaded
- `/kodo:status` — see current state
- `/kodo:plan` — create a milestone plan
- `/kodo:memory` — check memory state
- `/kodo:mode architect` — switch agent
- `/kodo:cost` — check token costs
- `/kodo:health` — run health checks
- Each step: exact command + expected output

### 5.3 docs/HOOKS.md
- All 9 hook types with:
  - When it fires
  - stdin JSON schema (input)
  - stdout JSON schema (output)
  - Real example payloads
  - Error handling (exit code 2)
- Hook types: PreToolUse, PostToolUse, PostToolUseFailure, Stop, Notification, PreCompact, SessionStart, UserPromptSubmit, SessionEnd

### 5.4 docs/ARCHITECTURE.md
- Layer model (3 layers: Surface → Engines → Infrastructure)
- Data flow diagrams (from design doc section 3.2)
- Module dependency map
- File layout with line counts
- Cross-references to source files

### 5.5 docs/MEMORY.md
- MemCell interface definition
- Consolidation algorithm (Jaccard similarity)
- Decay math with retention curve
- BM25 tokenization pipeline
- Recall pipeline (BM25 + TF-IDF + RRF + decay)
- User profile schema

### 5.6 docs/TROUBLESHOOTING.md
FAQ format:
- "Hooks not firing" → check bun, paths, CLAUDE_PLUGIN_ROOT
- "Memory not persisting" → check memory/ dir, permissions
- "Vault key error" → recreate key, check 0o600 permissions
- "Circuit breaker open" → RAG failed 3x, wait 60s
- "Injection false positive" → check score threshold, Unicode
- "Budget exceeded" → check cost-tracker limits
- "Tests failing" → check Bun version, clean install

### 5.7 SECURITY.md (root)
- Threat model table (from design doc section 4.1)
- OWASP Agentic Top 10 coverage
- OWASP LLM Top 10 coverage
- Autonomy matrix
- Injection scanner design
- Output guard patterns
- Vault encryption details
- Reporting vulnerabilities

### 5.8 CONTRIBUTING.md (root)
- TypeScript strict, no `any`, no default exports
- File naming: kebab-case.ts
- Naming: camelCase functions, PascalCase types
- Biome: tabs, 100 char width
- Testing: mirror src/ in test/, mkdtemp, cleanup, await all
- Commit: `bun test` + `bun run check` before commit
- PR checklist

### 5.9 scripts/smoke-test.sh
12 automated checks:
1. Bun installed
2. Dependencies install
3. Tests pass (338)
4. Lint clean (0 errors)
5. hooks.json exists and valid JSON
6. plugin.json exists and has name "kodo"
7. settings.json exists and valid JSON
8. 5 agent .md files present
9. 11 command .md files present
10. 2 skill SKILL.md files present
11. CLAUDE.md exists
12. All source files have corresponding test files

### 5.10 LICENSE
MIT license with Yann Abadie copyright.

### 5.11 CHANGELOG.md
- 0.3.0: Plugin restructuring, agents, commands, skills, smoke test
- 0.2.0: Wave 3 (importance-weighted decay, output guard, prompt scanning, kill switch)
- 0.1.0: Initial implementation (51 modules, 338 tests)

### 5.12 CLAUDE.md enrichment
- Add "Documentation" section with links to all docs/*.md
- Add formal hook payload JSON schemas (already partially there)

### 5.13 README.md update
- Add "Documentation" section with table linking to all docs
- Keep README as high-level overview

## 6. Principles

- Every command shown has expected output
- No handwaving — concrete, copy-pasteable
- Smoke test script is the single source of truth for "does it work?"
- Docs reference source files with paths (e.g., `src/security/injection.ts`)
