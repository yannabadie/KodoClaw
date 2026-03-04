# Installation Guide

## Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| [Bun](https://bun.sh) | >= 1.0 | `curl -fsSL https://bun.sh/install \| bash` or `brew install oven-sh/bun/bun` |
| Git | any | [git-scm.com](https://git-scm.com) |
| OS | macOS, Linux, or Windows | WSL or native Windows supported |

## Step 1: Clone the Repository

```bash
git clone https://github.com/yannabadie/KodoClaw.git
cd KodoClaw/kodo
```

**Verify:**

```bash
ls package.json
```

Expected: file listed without error.

## Step 2: Install Dependencies

```bash
bun install
```

Kodo has only 2 runtime dependencies:

| Package | Purpose |
|---------|---------|
| `@noble/ciphers` | XChaCha20-Poly1305 encryption for the vault |
| `yaml` | YAML parsing for custom mode files |

**Verify:**

```bash
ls node_modules/@noble/ciphers/package.json
```

Expected: file exists.

## Step 3: Run Tests

```bash
bun test
```

**Expected output:**

```
 381 pass
 0 fail
 808 expect() calls
Ran 381 tests across 49 files.
```

All 381 tests must pass. If any fail, see [Troubleshooting](TROUBLESHOOTING.md#tests-failing-after-clean-install).

## Step 4: Lint Check

```bash
bun run check
```

**Expected output:**

```
Checked 100 files in XXms. No fixes applied.
```

Zero errors required. If errors appear, run `bun run check:fix` to auto-fix.

## Step 5: Integrate with Claude Code

### Option A: Plugin Directory (recommended)

Point Claude Code directly at the Kodo directory:

```bash
claude --plugin-dir /path/to/kodo
```

This loads all hooks, agents, commands, and skills automatically.

### Option B: Merge Hooks into Settings

Copy the hooks from `hooks/hooks.json` into your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/src/hooks/cli.ts\" PreToolUse"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/src/hooks/cli.ts\" PostToolUse"
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/src/hooks/cli.ts\" PostToolUseFailure"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/src/hooks/cli.ts\" Stop"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/src/hooks/cli.ts\" Notification"
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/src/hooks/cli.ts\" PreCompact"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/src/hooks/cli.ts\" SessionStart"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/src/hooks/cli.ts\" UserPromptSubmit"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/src/hooks/cli.ts\" SessionEnd"
          }
        ]
      }
    ]
  }
}
```

The `${CLAUDE_PLUGIN_ROOT}` variable is resolved automatically by Claude Code to the plugin's directory.

## Step 6: Verify Integration

In a Claude Code session with Kodo loaded:

1. Type `/kodo:status`

   **Expected:** Shows current mode (code), autonomy level (trusted), memory cell count, and session cost.

2. Type `/kodo:health`

   **Expected:** Reports pass/fail status for each subsystem: memory, vault, audit, modes, planning, RAG, and web UI.

## Automated Verification

Run the smoke test script to verify everything at once:

```bash
./scripts/smoke-test.sh
```

**Expected output:**

```
Kodo Smoke Test
===============

  PASS  Bun installed
  PASS  Dependencies installed
  PASS  Tests pass (381)
  PASS  Lint clean (0 errors)
  PASS  hooks.json valid
  PASS  plugin.json name=kodo
  PASS  settings.json valid
  PASS  5 agents present
  PASS  11 commands present
  PASS  2 skills present
  PASS  CLAUDE.md exists
  PASS  Source-test parity

Results: 12 passed, 0 failed (out of 12)

ALL CHECKS PASSED (12/12)
```

## What Gets Loaded

When Kodo starts, it registers:

| Component | Count | Description |
|-----------|-------|-------------|
| Hooks | 9 | PreToolUse, PostToolUse, PostToolUseFailure, Stop, Notification, PreCompact, SessionStart, UserPromptSubmit, SessionEnd |
| Agents | 5 | code (default), architect, debug, review, security-audit |
| Commands | 11 | `/kodo:status`, `/kodo:plan`, `/kodo:memory`, `/kodo:audit`, `/kodo:cost`, `/kodo:health`, `/kodo:mode`, `/kodo:autonomy`, `/kodo:stop`, `/kodo:undo`, `/kodo:ui` |
| Skills | 2 | kodo-context (auto-invoked), security-check |

## Next Steps

- [Quick Start Guide](QUICKSTART.md) — 5-minute walkthrough of core features
- [Architecture](ARCHITECTURE.md) — understand how Kodo works internally
- [Hooks Reference](HOOKS.md) — detailed hook payload schemas
