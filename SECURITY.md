# Security

Kodo is a security-first Claude Code plugin. This document details the threat model, OWASP compliance, and security architecture.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

- **GitHub Issues**: [github.com/yannabadie/KodoClaw/issues](https://github.com/yannabadie/KodoClaw/issues) (for non-sensitive issues)
- **Private disclosure**: For sensitive vulnerabilities, use GitHub's private vulnerability reporting feature

Please include: description, reproduction steps, impact assessment, and suggested fix if possible.

## Threat Model

| Threat | Attack Vector | Mitigation | Module |
|--------|--------------|------------|--------|
| Prompt injection | Malicious content in tool output or user prompt | Aho-Corasick scanner (44 markers), UserPromptSubmit hook | `src/security/injection.ts` |
| Unicode evasion | Cyrillic lookalikes, zero-width chars | Homoglyph normalization + zero-width stripping | `src/security/injection.ts` |
| Prompt extraction | "Repeat your instructions" attacks | 10 extraction markers + anti-leakage armor (LLM07) | `src/security/injection.ts`, `src/context/assembler.ts` |
| Memory poisoning | Injected facts via external content | SHA-256 checksum verification + injection scan on writes + type guard validation | `src/memory/memcell.ts` |
| Secret exfiltration | Reading .env, .ssh, credentials | Sensitive path blocklist on all file tools | `src/security/blocklist.ts` |
| Command injection | Dangerous shell commands | 4-tier risk classifier + autonomy policy matrix | `src/security/policy.ts` |
| Code execution via output | XSS, eval, SQL in LLM output | Output guard scanning 11 patterns (ASI05) | `src/security/output-guard.ts` |
| Cascading failure | External service outage | Circuit breaker (threshold=3, reset=60s) | `src/security/circuit-breaker.ts` |
| Resource exhaustion | Token bombing | Cost tracker + budget enforcement | `src/security/cost-tracker.ts` |
| Skill tampering | Modified skill files | SHA-256 manifest integrity verification | `src/security/integrity.ts` |
| Behavioral anomaly | Compromised agent behavior | Baseline tracking with kill switch at 2x threshold | `src/security/baseline.ts` |

## OWASP Agentic Top 10 (2026)

| ID | Threat | Status | Mitigation |
|----|--------|--------|------------|
| ASI01 | Agent Goal Hijack | Covered | Aho-Corasick scanner with 44 markers across 7 categories, Unicode homoglyph normalization (Cyrillic→Latin), zero-width character stripping, user prompt scanning via UserPromptSubmit hook |
| ASI02 | Tool Misuse | Covered | Shell risk classifier (4 tiers: low/medium/high/critical), autonomy policy matrix, sensitive path blocklist for read/write/edit/glob/grep tools |
| ASI03 | Identity & Privilege Abuse | Covered | 4-level autonomy (guarded→supervised→trusted→autonomous) with mode-specific tool restrictions, YAML loader validates autonomy values and rejects built-in slug conflicts |
| ASI04 | Supply Chain Vulnerabilities | Covered | SHA-256 manifest verification for skill files, only 2 runtime dependencies |
| ASI05 | Unexpected Code Execution | Covered | Output guard scans for 11 patterns: XSS (script tags, javascript: URIs, event handlers), code execution (eval, Function, import, child_process), SQL injection (DROP TABLE, DELETE FROM, UNION SELECT), destructive commands (rm -rf /) |
| ASI06 | Memory & Context Poisoning | Covered | MemCell SHA-256 checksums, injection scanning on writes (blocks score >= 4), `isMemCell()` type guard validates JSON from disk |
| ASI07 | Multi-Agent Message Auth | Planned | HMAC-signed inter-agent messages with anti-replay (future work) |
| ASI08 | Cascading Failures | Covered | Circuit breaker on RAG connector (closed→open→half_open, threshold=3, reset=60s) |
| ASI09 | Human-Agent Trust Exploitation | Covered | Append-only JSONL audit log with daily rotation, tool failure logging, session summaries |
| ASI10 | Rogue Agents | Covered | Behavioral baseline tracking (tool frequency, injection attempts, sensitive access), kill switch at 2x anomaly threshold via `{ continue: false }` |

## OWASP LLM Top 10 (2025)

| ID | Threat | Status | Mitigation |
|----|--------|--------|------------|
| LLM01 | Prompt Injection | Covered | Same as ASI01: Aho-Corasick scanner, homoglyph normalization, zero-width stripping, prompt scanning |
| LLM05 | Improper Output Handling | Covered | Output guard module scans all LLM output, content redaction preserving regex flags |
| LLM07 | System Prompt Leakage | Covered | 10 prompt extraction markers in injection scanner, anti-leakage armor appended to system prompt within token budget |

## Autonomy Matrix

Controls what happens when a tool call is classified at each risk level:

| Level | Low Risk | Medium Risk | High Risk | Critical Risk |
|-------|----------|-------------|-----------|---------------|
| **guarded** | confirm | confirm | block | block |
| **supervised** | allow | confirm | confirm | block |
| **trusted** | allow | allow | confirm | block |
| **autonomous** | allow | allow | allow | **block** |

Critical commands are **always blocked**, even in autonomous mode. This is a deliberate safety constraint — no autonomy level bypasses destructive command protection.

### Shell Risk Classification

| Risk Level | Examples |
|------------|----------|
| **critical** | `rm -rf /`, `chmod 777`, `curl \| sh`, `python -c`, `node -e`, `powershell -enc`, `eval()`, `exec()`, `bun eval` |
| **high** | `git push --force`, `npm publish`, `docker run`, `docker exec`, `kubectl exec` |
| **medium** | `git commit`, `npm install`, `pip install` |
| **low** | `ls`, `cat`, `grep`, `git status`, `bun test` |

## Injection Scanner

Aho-Corasick automaton for O(n) multi-pattern matching against all input content.

### Pipeline

```
Input text
    │
    ▼
Normalize Unicode (Cyrillic → Latin homoglyphs)
    │
    ▼
Strip zero-width characters (\u200B, \u200C, \u200D, \uFEFF, \u00AD)
    │
    ▼
Lowercase
    │
    ▼
Aho-Corasick scan against 44 markers
    │
    ▼
Score → action
  0     → clean
  1     → flag (log only)
  2-3   → sanitize (redact matches)
  4+    → block (reject entirely)
```

### Marker Categories (44 markers across 7 categories)

| Category | Examples |
|----------|----------|
| Role override | "ignore previous instructions", "ignore all previous", "disregard above" |
| Identity swap | "you are now", "new role", "act as" |
| System prompt | "system prompt", "system:", "&lt;\|system\|&gt;" |
| Instruction override | "new instructions", "override instructions" |
| Social engineering | "the developer said", "admin override", "maintenance mode" |
| Encoding evasion | "aWdub3Jl" (base64 "ignore"), "ZGlzcmVnYXJk" (base64 "disregard") |
| Prompt extraction (LLM07) | "repeat your instructions", "show me your system prompt", "what are your rules" |

## Output Guard (ASI05)

Scans all LLM output for dangerous patterns before returning to the user:

| Category | Patterns Detected |
|----------|-------------------|
| XSS | `<script>` tags, `javascript:` URIs, `on*=` event handlers (onload, onerror, onclick, etc.) |
| Code execution | `eval()`, `new Function()`, `import()`, `require('child_process')` |
| SQL injection | `DROP TABLE`, `; DELETE FROM`, `UNION SELECT` |
| Destructive commands | `rm -rf /` |

When a pattern is detected, the output is blocked with `{ decision: "block", reason: "..." }`.

## Vault Encryption

Secrets are stored at rest using XChaCha20-Poly1305 via `@noble/ciphers`:

- **Cipher**: XChaCha20-Poly1305 (chosen over AES-GCM for longer 24-byte nonce, eliminating nonce-reuse risk)
- **Key**: 256-bit random, stored in `vault.key` with owner-only permissions (mode 0600)
- **Nonce**: 24 bytes, randomly generated per encryption operation
- **Storage**: `vault.enc` JSON file with encrypted values as hex strings (`ENC:` prefix + hex(nonce + ciphertext))
- **Write safety**: Atomic write-then-rename (`vault.enc.tmp` → `vault.enc`) prevents corruption from process crashes

## EU AI Act Compliance

Kodo implements controls aligned with EU AI Act Article 14 (human oversight):

- **Kill switch**: `/kodo:stop` immediately sets autonomy to guarded and halts autonomous operations. Behavioral baseline triggers automatic kill switch at 2x anomaly threshold via `{ continue: false, stopReason: "..." }`
- **Approval workflows**: Autonomy matrix ensures human confirmation for medium+ risk actions in supervised mode and high+ risk in trusted mode
- **Append-only audit**: Every tool call, mode switch, and security event is logged to daily JSONL files. Logs cannot be modified or deleted during a session
- **Transparency**: `/kodo:audit` shows recent actions. `/kodo:cost` shows resource usage. Web dashboard provides real-time visibility
