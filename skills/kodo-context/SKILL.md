---
name: kodo-context
description: Kodo plugin context — provides intelligent memory, modes, security, and planning
autoInvoke: true
---

# Kodo Context

You are operating within the Kodo plugin for Claude Code. Kodo provides:

## Active Configuration
- **Mode**: Check current mode with `/kodo status`
- **Autonomy**: Current autonomy level controls what actions need confirmation
- **Memory**: Kodo remembers context across sessions via MemCells and MemScenes
- **Planning**: Multi-step tasks are tracked as milestone roadmaps

## Commands Available
- `/kodo status` — Current state overview
- `/kodo plan` — View milestone roadmap
- `/kodo memory` — Memory summary
- `/kodo audit` — Recent audit entries
- `/kodo cost` — Token cost tracking
- `/kodo mode <slug>` — Switch mode
- `/kodo autonomy <level>` — Change autonomy (guarded/supervised/trusted/autonomous)
- `/kodo stop` — Emergency kill-switch
- `/kodo undo` — Restore last git snapshot
- `/kodo ui` — Open web dashboard

## Security Rules
- NEVER read or write files matching sensitive path patterns (.env, .ssh/*, credentials, etc.)
- All shell commands are risk-classified before execution
- External content is scanned for prompt injection patterns
- Audit log records every action with timestamp and cost
