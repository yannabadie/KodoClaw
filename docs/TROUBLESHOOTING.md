# Troubleshooting

Common problems and solutions for Kodo. Each entry includes the problem, cause, solution, and a verification command.

## Hooks Not Firing

**Problem:** Kodo commands (`/kodo:status`) don't work or hooks don't intercept tool calls.

**Cause:** `hooks.json` not loaded by Claude Code, Bun not in PATH, or `${CLAUDE_PLUGIN_ROOT}` not resolved.

**Solution:**

1. Verify Bun is installed and in PATH:
   ```bash
   bun --version
   ```
2. Verify you're loading the plugin:
   ```bash
   claude --plugin-dir /path/to/kodo
   ```
3. Check hooks.json exists and is valid:
   ```bash
   cat hooks/hooks.json | bun -e 'JSON.parse(await Bun.stdin.text()); console.log("valid")'
   ```
4. If using settings.json integration, ensure the hooks section was copied correctly from `hooks/hooks.json`

**Verify:** `/kodo:status` should show current mode and autonomy level.

---

## Invalid Payload Error (Exit Code 2)

**Problem:** Hook returns exit code 2 with "invalid payload" on stderr.

**Cause:** The hook received malformed JSON on stdin. Fields may be missing or misnamed.

**Solution:**

1. Check which hook is failing (the hook type is in the error message)
2. Verify the JSON structure matches the expected schema in [Hooks Reference](HOOKS.md)
3. Ensure your Claude Code version supports the hook type
4. Test manually:
   ```bash
   echo '{"tool_name":"Read","tool_input":{"file_path":"test.ts"}}' | bun run src/hooks/cli.ts PreToolUse
   ```

**Verify:** The manual test above should return JSON with `permissionDecision` without errors.

---

## Memory Not Persisting Between Sessions

**Problem:** MemCells created in one session are gone in the next.

**Cause:** The `memory/` directory doesn't exist at the plugin root, or write permissions are missing.

**Solution:**

1. Check directory exists:
   ```bash
   ls -la memory/
   ```
2. If missing, create it:
   ```bash
   mkdir -p memory
   ```
3. Check write permissions:
   ```bash
   touch memory/test && rm memory/test && echo "writable"
   ```

**Verify:** After creating MemCells, check they persist:
```bash
ls memory/*.json
```

---

## Vault Key Error / Corrupted Vault

**Problem:** Encryption/decryption errors, or "vault key not found" messages.

**Cause:** `vault.key` file is missing, has wrong permissions, or `vault.enc` was corrupted during a crash.

**Solution:**

1. Check if vault files exist:
   ```bash
   ls -la memory/vault.key memory/vault.enc
   ```
2. Check key permissions (should be owner-only, mode 0600):
   ```bash
   stat -c '%a' memory/vault.key   # Linux
   stat -f '%Lp' memory/vault.key  # macOS
   ```
3. If corrupted, delete both files — Kodo regenerates them on next start:
   ```bash
   rm -f memory/vault.key memory/vault.enc
   ```

**Verify:** After restart, vault.key should exist with mode 0600:
```bash
ls -la memory/vault.key
# Expected: -rw------- (mode 600)
```

---

## Circuit Breaker Open (RAG Not Responding)

**Problem:** NotebookLM queries return empty results or errors.

**Cause:** The RAG connector failed 3 consecutive times, triggering the circuit breaker to the `open` state.

**Solution:**

1. Wait 60 seconds — the circuit breaker auto-resets to `half_open` state
2. Check if NotebookLM service is accessible
3. Verify your NotebookLM configuration (MCP server, Python library, or API credentials)

**Verify:** `/kodo:health` should show RAG connector status. After 60 seconds, the next query attempt will use `half_open` state (allows one trial request).

---

## Injection False Positive

**Problem:** Legitimate content is being flagged or blocked by the injection scanner.

**Cause:** Content matches one or more of the 44 injection markers. Common triggers include documentation about security, AI instructions, or system prompts.

**Understanding scores:**

| Score | Action | Meaning |
|-------|--------|---------|
| 0 | Clean | No markers detected |
| 1 | Flag | Logged only, no action taken |
| 2-3 | Sanitize | Matched content is redacted |
| 4+ | Block | Entire content rejected |

**Solution:**

1. Check the audit log for details:
   ```
   /kodo:audit
   ```
2. The log shows which specific markers were matched
3. For score 1 (flag only): no action needed, content passes through
4. For score 2-3: content is redacted but not blocked
5. For score 4+: restructure the content to avoid marker phrases

**Verify:** Check the audit log entry for the specific markers and scores.

---

## Budget Exceeded

**Problem:** Cost tracker reports budget exceeded, or operations are being rate-limited.

**Cause:** Session or daily token usage has exceeded the configured budget limit.

**Solution:**

1. Check current usage:
   ```
   /kodo:cost
   ```
2. Review the budget configuration
3. Start a new session to reset session-level counters

**Verify:** `/kodo:cost` shows current usage vs. budget.

---

## Tests Failing After Clean Install

**Problem:** `bun test` shows failures after a fresh clone or install.

**Cause:** Wrong Bun version, incomplete install, or stale node_modules cache.

**Solution:**

1. Check Bun version (need >= 1.0):
   ```bash
   bun --version
   ```
2. Clean install:
   ```bash
   rm -rf node_modules
   bun install
   ```
3. Run tests:
   ```bash
   bun test
   ```

**Expected:** 338 pass, 0 fail, 742 expect() calls.

**Verify:** All tests pass with zero failures.

---

## Biome Lint/Format Errors

**Problem:** `bun run check` reports errors.

**Cause:** Code doesn't match Biome formatting rules (tabs, 100 char line width, recommended rules).

**Solution:**

1. Auto-fix most issues:
   ```bash
   bun run check:fix
   ```
2. For remaining issues, manually adjust code to match Biome rules
3. Check Biome config in `biome.json`

**Verify:**
```bash
bun run check
# Expected: Checked 98 files in XXms. No fixes applied.
```

---

## Web Dashboard Won't Start

**Problem:** `/kodo:ui` fails or the dashboard is unreachable.

**Cause:** Port 3700 is already in use, or the HMAC key hasn't been generated.

**Solution:**

1. Check if port 3700 is in use:
   ```bash
   # macOS/Linux
   lsof -i :3700

   # Windows
   netstat -ano | findstr 3700
   ```
2. Kill the conflicting process if found
3. Try starting the dashboard again:
   ```
   /kodo:ui
   ```

**Verify:** `/kodo:ui` should display:
- A pairing token for authentication
- The URL to open in browser (http://127.0.0.1:3700)
- Instructions for first-time pairing

Note: The dashboard binds to `127.0.0.1` only (never `0.0.0.0`) for security.

---

## MemCell Checksum Mismatch

**Problem:** Warning message about checksum mismatch when loading MemCells.

**Cause:** A MemCell file was modified outside of Kodo (manual edit, disk corruption, or tampering attempt).

**Solution:**

1. The warning is logged but the cell is still loaded (it's a detection mechanism, not a blocker)
2. Check the audit log for details:
   ```
   /kodo:audit
   ```
3. If tampering is suspected, delete the specific MemCell file and let Kodo rebuild from remaining cells
4. If disk corruption, check filesystem integrity

**Verify:** `verifyChecksum()` returns `false` for tampered cells. The `[kodo] MemCell mc_XXXX checksum mismatch — possible tampering` message is expected for modified files.

---

## Getting More Help

- [Installation Guide](INSTALL.md) — setup prerequisites and verification
- [Hooks Reference](HOOKS.md) — payload schemas for debugging hook issues
- [Architecture](ARCHITECTURE.md) — understand module dependencies
- [Security](../SECURITY.md) — security design and OWASP coverage
- [GitHub Issues](https://github.com/yannabadie/KodoClaw/issues) — report bugs or request features
