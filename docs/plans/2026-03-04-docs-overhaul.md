# Documentation Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create exhaustive, precise documentation for mass adoption — for both AI and humans — with a verifiable smoke test script.

**Architecture:** Focused markdown files in `docs/`, root-level GitHub-standard files (SECURITY.md, CONTRIBUTING.md, LICENSE, CHANGELOG.md), and an automated smoke test script. No code changes to src/ or test/.

**Tech Stack:** Markdown, Bash (smoke test), Git

---

### Task 1: Create LICENSE

**Files:**
- Create: `LICENSE`

**Step 1: Create MIT license file**

```text
MIT License

Copyright (c) 2026 Yann Abadie

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 2: Verify**

Run: `head -1 LICENSE`
Expected: `MIT License`

---

### Task 2: Create CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`

**Step 1: Create changelog**

Content should cover three versions:

- **0.3.0 (2026-03-04)** — Plugin restructuring
  - Added: `.claude-plugin/plugin.json` manifest (v0.3.0, author, license, keywords)
  - Added: 5 agent definitions (`agents/`: code, architect, debug, review, security-audit)
  - Added: 11 slash commands (`commands/`: status, plan, memory, audit, cost, health, mode, autonomy, stop, undo, ui)
  - Added: 2 skills (`skills/`: kodo-context, security-check)
  - Added: `settings.json` with default agent (`code`) and tool permissions
  - Added: Comprehensive documentation (INSTALL, QUICKSTART, HOOKS, ARCHITECTURE, MEMORY, TROUBLESHOOTING, SECURITY, CONTRIBUTING)
  - Added: `scripts/smoke-test.sh` automated verification
  - Added: LICENSE (MIT), CHANGELOG.md
  - Changed: `.gitignore` expanded with `/plans/library/`, `/rag-cache/`, `/modes/`

- **0.2.0 (2026-03-04)** — Security hardening (Wave 3)
  - Added: Output guard module (ASI05) — scans LLM output for XSS, eval, SQL injection, destructive commands (11 patterns)
  - Added: UserPromptSubmit hook — scans user prompts for injection before Claude processes them
  - Added: PostToolUseFailure hook — logs tool failures to daily JSONL
  - Added: SessionStart hook — loads profile + memory context into Claude
  - Added: SessionEnd hook — session termination audit record
  - Added: Kill switch — `{ continue: false }` halts Claude entirely
  - Added: Importance-weighted memory decay — FadeMem-inspired `e^(-(t/S)^β)` with configurable importance
  - Added: Behavioral baseline with kill switch at 2x anomaly threshold
  - Added: Anti-leakage armor in system prompt (LLM07 defense)
  - Added: PostToolUse top-level `decision: "block"` format per official spec
  - Added: Type guard validation for MemCells (`isMemCell()`)
  - Added: All 9 hook payloads validated before processing (exit code 2 on failure)
  - Changed: Hook count 6 → 9 (added SessionStart, UserPromptSubmit, PostToolUseFailure)
  - Changed: Stemmer rule order fixed (`-ation` before `-tion`)
  - Changed: Baseline prunes stale events (bounded memory)

- **0.1.0 (2026-03-03)** — Initial implementation
  - 51 source modules, 47 test files, 338 tests, 742 assertions
  - Security kernel: vault (XChaCha20-Poly1305), policy, blocklist, injection scanner (44 markers), audit, circuit breaker, rate limiter, cost tracker, integrity
  - Memory engine: MemCell, MemScene, BM25, Porter stemmer, decay, profile, recall (RRF)
  - Mode engine: 6 built-in modes + custom YAML loader
  - Planning: milestone planner, hints, library
  - Context assembly: token budget (3K), sanitizer, sufficiency
  - RAG: NotebookLM connector (MCP/Python/API), cache (BM25 fuzzy match)
  - Hooks: PreToolUse, PostToolUse, Stop, Notification, PreCompact, SessionEnd
  - UI: localhost web dashboard with HMAC auth
  - CLI: 11 slash commands

**Step 2: Verify**

Run: `grep -c "^## " CHANGELOG.md`
Expected: `3` (three version headers)

---

### Task 3: Create SECURITY.md

**Files:**
- Create: `SECURITY.md`

**Step 1: Create security documentation**

Content must include:
- Reporting vulnerabilities (email/GitHub issues)
- Threat model table (11 threats from design doc section 4.1)
- OWASP Agentic Top 10 (2026) coverage table with ID, threat, and mitigation for ASI01-ASI10
- OWASP LLM Top 10 (2025) coverage for LLM01, LLM05, LLM07
- Autonomy matrix (4 levels × 4 risk categories)
- Injection scanner design: Aho-Corasick, 44 markers, 7 categories, scoring (0=clean, 1=flag, 2-3=sanitize, 4+=block), Unicode normalization, zero-width stripping
- Output guard patterns: XSS (script, javascript:, on*=), code execution (eval, Function, import, child_process), SQL injection (DROP TABLE, DELETE FROM, UNION SELECT), destructive (rm -rf /)
- Vault encryption: XChaCha20-Poly1305, 256-bit key, 24-byte nonce, atomic write-then-rename, key mode 0o600
- EU AI Act Article 14 compliance: kill switch, approval workflows, append-only audit

Source: Pull exact tables and details from `docs/plans/2026-03-03-kodo-design.md` sections 4.1-4.4 and `README.md` OWASP section.

**Step 2: Verify**

Run: `grep -c "ASI0" SECURITY.md`
Expected: at least `9` (ASI01 through ASI10 minus ASI07 which is future work)

---

### Task 4: Create CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

**Step 1: Create contributing guide**

Content must include:
- Prerequisites (Bun >= 1.0, Git)
- Getting started (`bun install`, `bun test`, `bun run check`)
- Code conventions:
  - TypeScript strict, no `any`, no default exports
  - File naming: `kebab-case.ts`
  - Variables/functions: `camelCase`
  - Types/classes: `PascalCase`
  - One export per file preferred
  - Await all async I/O (no fire-and-forget)
  - All hook payloads validated before processing (exit 2 on failure)
  - All JSON from disk validated with type guards
- Biome config: tabs, 100 char line width, recommended rules
- Testing conventions:
  - Every `src/X/Y.ts` has `test/X/Y.test.ts`
  - Temp dirs: `mkdtemp(join(tmpdir(), "kodo-<module>-"))`
  - Cleanup: `rm(dir, { recursive: true, force: true })`
  - Always await async operations
  - Use `{ force: true }` on cleanup
  - No mocking of security functions
- Commit workflow:
  - `bun test` must show 338+ pass, 0 fail
  - `bun run check` must show 0 errors
  - Conventional commits preferred
- Dependencies: max 2 runtime deps, no additions without design review
- Security rules: never store secrets plaintext, never bind to 0.0.0.0, always scan external content, always use timing-safe comparison

Source: Pull from `CLAUDE.md` conventions, testing, security rules, and dependencies sections.

**Step 2: Verify**

Run: `grep -c "bun" CONTRIBUTING.md`
Expected: at least `5`

---

### Task 5: Create docs/INSTALL.md

**Files:**
- Create: `docs/INSTALL.md`

**Step 1: Create installation guide**

Structure:
1. **Prerequisites**
   - Bun >= 1.0 (`curl -fsSL https://bun.sh/install | bash` or `brew install oven-sh/bun/bun`)
   - Git
   - OS: macOS, Linux, Windows (WSL or native)

2. **Step 1: Clone the repository**
   ```bash
   git clone https://github.com/yannabadie/KodoClaw.git
   cd KodoClaw/kodo
   ```
   Verify: `ls package.json` → file exists

3. **Step 2: Install dependencies**
   ```bash
   bun install
   ```
   Verify: `ls node_modules/@noble/ciphers` → directory exists

4. **Step 3: Run tests**
   ```bash
   bun test
   ```
   Expected output:
   ```
   338 pass
   0 fail
   742 expect() calls
   ```

5. **Step 4: Lint check**
   ```bash
   bun run check
   ```
   Expected: `Checked 98 files in XXms. No fixes applied.`

6. **Step 5: Integrate with Claude Code**

   **Option A: Plugin directory (recommended)**
   ```bash
   claude --plugin-dir /path/to/kodo
   ```

   **Option B: Merge hooks into settings**
   Copy the content of `hooks/hooks.json` into your project's `.claude/settings.json`.
   Show the exact JSON structure from hooks/hooks.json.

7. **Step 6: Verify integration**
   In a Claude Code session with the plugin loaded:
   - Type `/kodo:status` — should show mode, autonomy level, memory stats
   - Type `/kodo:health` — should report pass/fail for each subsystem

8. **Automated verification**
   ```bash
   ./scripts/smoke-test.sh
   ```
   Expected: `ALL CHECKS PASSED (12/12)`

**Step 2: Verify**

Run: `grep -c "Verify" docs/INSTALL.md`
Expected: at least `6` (one per step)

---

### Task 6: Create docs/QUICKSTART.md

**Files:**
- Create: `docs/QUICKSTART.md`

**Step 1: Create quickstart guide**

Title: "Kodo in 5 Minutes"

Structure — each section has exact command + expected output:

1. **Launch Claude Code with Kodo**
   ```bash
   claude --plugin-dir /path/to/kodo
   ```
   What happens: SessionStart hook fires, loads your profile and memory context.

2. **Check status**
   `/kodo:status` — shows current mode (code), autonomy (trusted), memory cell count, active plan, session cost.

3. **Explore agents**
   List of 5 agents with one-line descriptions, how to switch: `/kodo:mode architect`

4. **Create a plan**
   `/kodo:plan create` — starts a milestone plan for the current task.
   `/kodo:plan show` — displays milestones with status indicators.

5. **Check memory**
   `/kodo:memory` — shows MemCell count, MemScene clusters, profile traits.

6. **Monitor costs**
   `/kodo:cost` — shows token usage, estimated USD, budget remaining.

7. **Run health checks**
   `/kodo:health` — reports status of each subsystem (memory, vault, audit, modes, planning, RAG, UI).

8. **Emergency stop**
   `/kodo:stop` — sets autonomy to guarded, halts autonomous operations. EU AI Act Art. 14 compliant.

9. **What's happening under the hood**
   Brief explanation: 9 hooks intercept every tool call. PreToolUse classifies risk. PostToolUse scans output. Everything is audited.

**Step 2: Verify**

Run: `grep -c "/kodo:" docs/QUICKSTART.md`
Expected: at least `8`

---

### Task 7: Create docs/HOOKS.md

**Files:**
- Create: `docs/HOOKS.md`

**Step 1: Create hooks reference**

For each of the 9 hooks, document:
- **When it fires** (one sentence)
- **Stdin JSON schema** (what Claude Code sends)
- **Stdout JSON schema** (what Kodo returns)
- **Example** (real JSON payload)
- **Error handling** (exit code 2 on invalid payload)

Hooks to document:

1. **PreToolUse** — fires before every tool call
   - Input: `{ tool_name: string, tool_input: object, session_id?: string }`
   - Output: `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow"|"deny"|"ask", permissionDecisionReason?: string } }`
   - Kill switch output: `{ continue: false, stopReason: string }`

2. **PostToolUse** — fires after every tool call
   - Input: `{ tool_name: string, tool_input: object, tool_output?: string, session_id?: string }`
   - Block output: `{ decision: "block", reason: string }`
   - Warning output: `{ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: string } }`

3. **PostToolUseFailure** — fires when a tool call fails
   - Input: `{ tool_name: string, tool_input: object, error?: string, session_id?: string }`
   - Output: `{}` (logs to audit, no response needed)

4. **SessionStart** — fires at session begin
   - Input: `{ session_id?: string }`
   - Output: `{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: string } }`

5. **UserPromptSubmit** — fires before Claude processes user prompt
   - Input: `{ prompt: string, session_id?: string }`
   - Block output: `{ decision: "block", reason: string }`
   - Allow output: `{}`

6. **Stop** — fires when session stops
   - Input: `{ session_id?: string }`
   - Output: `{}` (logs audit summary)

7. **Notification** — fires on alerts
   - Input: `{ level: string, message: string, session_id?: string }`
   - Output: `{}` (logs to JSONL)

8. **PreCompact** — fires before context compaction
   - Input: `{ session_id?: string }`
   - Output: `{}` (checkpoints memory)

9. **SessionEnd** — fires at session termination
   - Input: `{ reason?: string, session_id?: string }`
   - Output: `{}` (final audit record)

Also document:
- Legacy field names: `tool` (= `tool_name`), `params` (= `tool_input`), `sessionId` (= `session_id`)
- hooks.json format with `${CLAUDE_PLUGIN_ROOT}` variable
- Dispatcher flow: argv[2] → stdin → validate → normalize → handler → stdout

Source: `src/hooks/cli.ts`, `hooks/hooks.json`, design doc section 8.

**Step 2: Verify**

Run: `grep -c "###" docs/HOOKS.md`
Expected: at least `9` (one per hook type)

---

### Task 8: Create docs/ARCHITECTURE.md

**Files:**
- Create: `docs/ARCHITECTURE.md`

**Step 1: Create architecture documentation**

Content:

1. **Layer model** — 3 layers from design doc section 3.1:
   - Layer 0: Plugin Surface (hooks, agents, commands, skills, CLAUDE.md)
   - Layer 1: Engines (Mode, Memory, Policy Kernel)
   - Layer 2: Infrastructure (Vault, Circuit Breaker, Rate Limiter, Cost Tracker, Baseline, Integrity)

2. **Data flow** — from design doc section 3.2:
   - stdin JSON → cli.ts dispatcher → handler → stdout JSON
   - PreToolUse pipeline: extractPaths → blocklist → riskClassify → policyMatrix → decision
   - PostToolUse pipeline: scanInjection → sanitize → redact → outputGuard → decision

3. **Module map** — all 51 source files organized by subsystem with one-line descriptions:
   - security/ (11): vault, policy, blocklist, injection, output-guard, audit, baseline, circuit-breaker, cost-tracker, rate-limiter, integrity
   - memory/ (7): memcell, memscene, profile, recall, bm25, stemmer, decay
   - modes/ (9): base-mode, detector, loader, 6 built-in modes
   - planning/ (3): planner, hints, library
   - context/ (3): assembler, sanitizer, sufficiency
   - rag/ (2): connector, cache
   - hooks/ (8): cli, session-start, user-prompt-submit, post-tool-failure, stop, notification, precompact, session-end
   - ui/ (3): server, auth, routes
   - cli/ (3): commands, alerts, dashboard
   - root (2): index.ts, plugin.ts

4. **Dependencies** — only 2 runtime deps with rationale:
   - `@noble/ciphers` ^1.2.0 — XChaCha20-Poly1305 (chosen over AES-GCM for longer nonce)
   - `yaml` ^2.7.0 — custom mode YAML parsing

5. **Key design decisions** — table from design doc section 12 (15 decisions with rationale)

Source: `docs/plans/2026-03-03-kodo-design.md` sections 3, 12. `CLAUDE.md` file structure section.

**Step 2: Verify**

Run: `grep -c "src/" docs/ARCHITECTURE.md`
Expected: at least `20` (references to source files)

---

### Task 9: Create docs/MEMORY.md

**Files:**
- Create: `docs/MEMORY.md`

**Step 1: Create memory system documentation**

Content:

1. **Overview** — 4-phase lifecycle: Encode → Consolidate → Decay → Recall

2. **MemCell** — interface definition from design doc 5.1:
   - Fields: id, episode, facts[], tags[], timestamp, foresight?, checksum, importance?
   - Checksum: SHA-256 over `{ episode, facts (sorted), tags (sorted), importance? }`
   - Type guard: `isMemCell()` validates JSON from disk
   - Injection scanning: blocks writes with score >= 4

3. **Consolidation** — design doc 5.2:
   - Jaccard similarity: `J(A,B) = |A ∩ B| / |A ∪ B|`
   - Threshold: 0.3
   - Scene IDs: `crypto.randomUUID()`
   - Summary: accumulated facts (not replaced)

4. **Decay** — design doc 5.4:
   - Formula: `retention(t) = e^(-(t/S)^β)` where S = importance × 7 days, β = 0.8
   - Table: importance 0.5 → ~3.5 days half-life, 1.0 → ~7 days, 2.0 → ~14 days
   - Pruning: below 10% retention → removed by `pruneDecayed()`

5. **BM25 Search** — design doc 5.5:
   - Tokenization: lowercase → split `\W+` → filter 88 stop words → Porter stem (14 rules)
   - Parameters: k1=1.5, b=0.75
   - Serializable index

6. **Recall Pipeline** — design doc 5.3:
   - BM25 → Ranked list A
   - TF-IDF + Cosine similarity → Ranked list B
   - Reciprocal Rank Fusion (k=60) → Fused ranking
   - × retention score → Final ranking

7. **User Profile**:
   - Stable traits: key-value pairs (e.g., stack, style)
   - Temporary states: value + ISO expiry date, auto-filtered
   - `renderContext()` is non-mutating

Source: `docs/plans/2026-03-03-kodo-design.md` sections 5.1-5.5, `CLAUDE.md` memory section.

**Step 2: Verify**

Run: `grep -c "retention" docs/MEMORY.md`
Expected: at least `4`

---

### Task 10: Create docs/TROUBLESHOOTING.md

**Files:**
- Create: `docs/TROUBLESHOOTING.md`

**Step 1: Create troubleshooting guide**

FAQ format — each entry has: **Problem**, **Cause**, **Solution**, **Verify**:

1. **Hooks not firing**
   - Cause: `hooks.json` not loaded, Bun not in PATH, `${CLAUDE_PLUGIN_ROOT}` not resolved
   - Solution: Check `claude --plugin-dir`, verify `bun --version`, check hooks.json paths
   - Verify: `/kodo:status` should show current state

2. **"Invalid payload" error (exit code 2)**
   - Cause: Hook received malformed JSON on stdin
   - Solution: Check Claude Code version supports the hook type. Verify JSON structure matches expected schema (see `docs/HOOKS.md`)
   - Verify: `echo '{"tool_name":"test","tool_input":{}}' | bun run src/hooks/cli.ts PreToolUse`

3. **Memory not persisting between sessions**
   - Cause: `memory/` directory doesn't exist or wrong permissions
   - Solution: Run `mkdir -p memory` in plugin root, check write permissions
   - Verify: `ls -la memory/` should show directory with write access

4. **Vault key error / corrupted vault**
   - Cause: `vault.key` missing or wrong permissions, `vault.enc` corrupted during crash
   - Solution: Delete `vault.key` and `vault.enc`, Kodo will regenerate on next start
   - Verify: `ls -la memory/vault.key` should show `-rw-------` (mode 0600)

5. **Circuit breaker open (RAG not responding)**
   - Cause: NotebookLM connector failed 3 consecutive times
   - Solution: Wait 60 seconds for auto-reset to half_open state. Check NotebookLM service status
   - Verify: `/kodo:health` should show RAG status

6. **Injection false positive**
   - Cause: Legitimate content matched one of 44 injection markers
   - Solution: Score 1 = logged only (no action). Score 2-3 = content redacted. Score 4+ = blocked. Check audit log for the specific markers matched
   - Verify: `/kodo:audit` to see the detection event

7. **Budget exceeded**
   - Cause: Session or daily token cost exceeded configured limit
   - Solution: Check limits in cost tracker config. `/kodo:cost` to see current usage
   - Verify: Reset by starting a new session

8. **Tests failing after clean install**
   - Cause: Wrong Bun version, incomplete install, stale cache
   - Solution: `bun --version` (need >= 1.0), `rm -rf node_modules && bun install`, then `bun test`
   - Verify: 338 pass, 0 fail, 742 expect()

9. **Biome check errors**
   - Cause: Code doesn't match formatting rules (tabs, 100 char width)
   - Solution: `bun run check:fix` auto-fixes most issues
   - Verify: `bun run check` → `No fixes applied`

10. **Web dashboard won't start**
    - Cause: Port 3700 in use, or missing HMAC key
    - Solution: Check `lsof -i :3700` (macOS/Linux) or `netstat -ano | findstr 3700` (Windows). Kill conflicting process
    - Verify: `/kodo:ui` should show pairing token and URL

**Step 2: Verify**

Run: `grep -c "^##" docs/TROUBLESHOOTING.md`
Expected: at least `10`

---

### Task 11: Create scripts/smoke-test.sh

**Files:**
- Create: `scripts/smoke-test.sh`

**Step 1: Create the smoke test script**

```bash
#!/bin/bash
set -euo pipefail

PASS=0
FAIL=0
TOTAL=12

check() {
  local name="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "  PASS  $name"
    ((PASS++))
  else
    echo "  FAIL  $name"
    ((FAIL++))
  fi
}

echo "Kodo Smoke Test"
echo "==============="
echo ""

# 1. Bun installed
check "Bun installed" bun --version

# 2. Dependencies installed
check "Dependencies installed" test -d node_modules/@noble/ciphers

# 3. Tests pass
check "Tests pass (338)" bash -c "bun test 2>&1 | grep -q '338 pass'"

# 4. Lint clean
check "Lint clean (0 errors)" bash -c "bun run check 2>&1 | grep -q 'No fixes applied'"

# 5. hooks.json valid
check "hooks.json valid" bash -c "cat hooks/hooks.json | bun -e 'JSON.parse(await Bun.stdin.text())'"

# 6. plugin.json has name kodo
check "plugin.json name=kodo" bash -c "cat .claude-plugin/plugin.json | bun -e 'const j=JSON.parse(await Bun.stdin.text()); if(j.name!==\"kodo\") process.exit(1)'"

# 7. settings.json valid
check "settings.json valid" bash -c "cat settings.json | bun -e 'JSON.parse(await Bun.stdin.text())'"

# 8. All 5 agents present
check "5 agents present" bash -c "test $(ls agents/*.md 2>/dev/null | wc -l) -eq 5"

# 9. All 11 commands present
check "11 commands present" bash -c "test $(ls commands/*.md 2>/dev/null | wc -l) -eq 11"

# 10. Both skills present
check "2 skills present" bash -c "test -f skills/kodo-context/SKILL.md && test -f skills/security-check/SKILL.md"

# 11. CLAUDE.md exists
check "CLAUDE.md exists" test -f CLAUDE.md

# 12. Source-test parity
check "Source-test parity" bash -c "
  src_count=\$(find src -name '*.ts' -not -path '*/built-in/*' | wc -l)
  test_count=\$(find test -name '*.test.ts' | wc -l)
  test \$test_count -ge 40
"

echo ""
echo "Results: $PASS passed, $FAIL failed (out of $TOTAL)"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "ALL CHECKS PASSED ($TOTAL/$TOTAL)"
  exit 0
else
  echo "SOME CHECKS FAILED"
  exit 1
fi
```

**Step 2: Make executable**

Run: `chmod +x scripts/smoke-test.sh`

**Step 3: Run it**

Run: `./scripts/smoke-test.sh`
Expected: `ALL CHECKS PASSED (12/12)`

---

### Task 12: Update CLAUDE.md — add documentation links

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add Documentation section before the "## Key patterns" section**

Add:

```markdown
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
```

**Step 2: Verify**

Run: `grep -c "docs/" CLAUDE.md`
Expected: at least `6`

---

### Task 13: Update README.md — add documentation section

**Files:**
- Modify: `README.md`

**Step 1: Add Documentation section before the "## Development" section**

Add a "Documentation" section with a table:

| Document | Description |
|----------|-------------|
| [Installation Guide](docs/INSTALL.md) | Prerequisites, setup, verification |
| [Quick Start](docs/QUICKSTART.md) | 5-minute first session |
| [Hooks Reference](docs/HOOKS.md) | All 9 hook payload schemas |
| [Architecture](docs/ARCHITECTURE.md) | Layer model, module map |
| [Memory System](docs/MEMORY.md) | MemCell, decay, BM25, recall |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common problems & solutions |
| [Security](SECURITY.md) | OWASP, threat model, encryption |
| [Contributing](CONTRIBUTING.md) | Conventions, testing, commits |
| [Changelog](CHANGELOG.md) | Version history |
| [Design Document](docs/plans/2026-03-03-kodo-design.md) | Original design & decisions |

**Step 2: Verify**

Run: `grep -c "docs/" README.md`
Expected: at least `8`

---

### Task 14: Final verification

**Step 1: Run smoke test**

Run: `./scripts/smoke-test.sh`
Expected: `ALL CHECKS PASSED (12/12)`

**Step 2: Run tests**

Run: `bun test`
Expected: 338 pass, 0 fail, 742 expect()

**Step 3: Run lint**

Run: `bun run check`
Expected: 0 errors

**Step 4: Check all new files exist**

Run: `ls LICENSE CHANGELOG.md SECURITY.md CONTRIBUTING.md docs/INSTALL.md docs/QUICKSTART.md docs/HOOKS.md docs/ARCHITECTURE.md docs/MEMORY.md docs/TROUBLESHOOTING.md scripts/smoke-test.sh`
Expected: all 11 files listed without errors

**Step 5: Commit**

```bash
git add LICENSE CHANGELOG.md SECURITY.md CONTRIBUTING.md docs/ scripts/ CLAUDE.md README.md
git commit -m "docs: comprehensive documentation for mass adoption

- Add LICENSE (MIT), CHANGELOG.md, SECURITY.md, CONTRIBUTING.md
- Add docs/INSTALL.md, QUICKSTART.md, HOOKS.md, ARCHITECTURE.md, MEMORY.md, TROUBLESHOOTING.md
- Add scripts/smoke-test.sh automated verification (12 checks)
- Update CLAUDE.md and README.md with documentation links"
```
