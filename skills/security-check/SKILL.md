---
name: security-check
description: Verify OWASP compliance and security patterns. Use when reviewing code for security vulnerabilities, checking for injection, or auditing tool usage.
---

# Security Check

When reviewing code for security, verify the following areas systematically.

## 1. Injection Patterns

Check that external content is scanned before processing:
- User prompts scanned via `UserPromptSubmit` hook (blocks at score >= 4)
- Memory writes scanned via `createMemCell()` injection check
- RAG content scanned before use
- Aho-Corasick scanner covers 44 markers across 7 categories
- Unicode homoglyphs normalized (Cyrillic to Latin)
- Zero-width characters stripped before scanning

## 2. Sensitive Paths

Verify sensitive path blocking covers:
- `.env`, `.env.*` files
- `.ssh/*` (keys, config, known_hosts)
- Credential files (credentials.json, service-account.json, etc.)
- Token/secret files in common locations
- Check `isSensitivePath()` and `isConfidentialContent()` in `src/security/blocklist.ts`

## 3. Shell Risk Classification

Verify shell commands are classified correctly:
- CRITICAL: `rm -rf /`, `mkfs`, `dd if=`, format commands
- HIGH: `python -c`, `node -e`, `docker run`, PowerShell `-enc`, `eval()`, `exec()`
- MEDIUM: Package installs, git push, service restarts
- LOW: Read-only operations (ls, cat, git status)
- Check `classifyShellRisk()` in `src/security/policy.ts`

## 4. Output Guard Patterns

Verify LLM output scanning covers:
- XSS: `<script>`, `javascript:` URIs, event handlers (`onload=`, `onerror=`)
- Code execution: `eval()`, `Function()`, `import()`, `child_process`
- SQL injection: `DROP TABLE`, `DELETE FROM`, `UNION SELECT`
- Destructive commands: `rm -rf /`
- Check `src/security/output-guard.ts`

## 5. Memory Integrity

Verify memory system is tamper-resistant:
- MemCells have SHA-256 checksums via `computeChecksum()`
- `verifyChecksum()` detects tampering
- `loadMemCells()` validates JSON with `isMemCell()` type guard
- Injection scanning on write (blocks score >= 4)

## 6. Authentication and Crypto

Verify cryptographic operations:
- HMAC comparison uses `timingSafeEqual` with hex validation
- Vault uses XChaCha20-Poly1305 (via @noble/ciphers)
- Vault key file restricted to mode 0o600
- Atomic write-then-rename for vault and cache operations
