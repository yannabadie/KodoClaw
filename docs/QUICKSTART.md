# Kodo in 5 Minutes

This guide walks you through your first Kodo session. Prerequisites: Kodo installed and integrated with Claude Code (see [Installation Guide](INSTALL.md)).

## 1. Launch Claude Code with Kodo

```bash
claude --plugin-dir /path/to/kodo
```

When the session starts, Kodo's **SessionStart** hook fires automatically. It loads your user profile and memory context into Claude's system prompt.

## 2. Check Status

```
/kodo:status
```

Shows the current Kodo state:

- **Mode**: `code` (default) — trusted autonomy, full tool access
- **Autonomy**: `trusted` — low and medium risk auto-approved, high+ requires confirmation
- **Memory**: MemCell count and MemScene count
- **Plan**: Active milestone plan (if any)
- **Cost**: Session token usage and estimated USD

## 3. Explore Agents

Kodo ships with 5 agents, each tuned for a specific workflow:

| Agent | Autonomy | Tools | Best for |
|-------|----------|-------|----------|
| **code** | trusted | full | General coding (default) |
| **architect** | supervised | read-only | System design, dependency analysis |
| **debug** | trusted | full | Debugging with audit log access |
| **review** | guarded | read-only | Code review, OWASP compliance |
| **security-audit** | supervised | read-only | Security vulnerability assessment |

Switch agents:

```
/kodo:mode architect
```

Switch back:

```
/kodo:mode code
```

## 4. Create a Plan

Start a milestone plan for your current task:

```
/kodo:plan create
```

Kodo creates a hierarchical milestone roadmap. View it:

```
/kodo:plan show
```

Example output:

```
Plan: "Add user authentication"
├── [completed] Set up JWT library
├── [in_progress] Implement login endpoint
├── [pending] Add session middleware
└── [pending] Write integration tests
```

Complete a milestone:

```
/kodo:plan complete "Set up JWT library"
```

## 5. Check Memory

Kodo remembers context across sessions using episodic memory:

```
/kodo:memory
```

Shows:

- **MemCells**: Individual memory units with facts and tags
- **MemScenes**: Clustered groups of related memories
- **Profile**: Your stable traits (tech stack, coding style) and temporary states

Memories decay over time using an importance-weighted curve. Important memories persist longer (up to ~14 days), less important ones fade faster (~3.5 days). Memories with `importance: Infinity` never decay and are permanently retained.

## 6. Monitor Costs

Track token usage and estimated costs:

```
/kodo:cost
```

Shows:

- Session token usage (input/output)
- Estimated session cost in USD
- Daily cumulative cost
- Cost trend compared to 7-day average

## 7. Run Health Checks

Verify all subsystems are working:

```
/kodo:health
```

Reports pass/fail for each subsystem:

1. **Memory engine** — MemCells readable, BM25 index valid
2. **Vault** — Key exists, encryption/decryption working
3. **Audit log** — Writable, recent entries parseable
4. **Mode engine** — Current mode loaded, built-in modes available
5. **Planning** — Library accessible
6. **RAG** — NotebookLM connector status
7. **Web UI** — Server status and port availability

## 8. View Audit Log

See what Kodo has been tracking:

```
/kodo:audit
```

Shows recent audit entries with timestamp, event type, tool used, risk level, and cost. Highlights anomalies like denied tools, injection detections, and threshold breaches.

## 9. Emergency Stop

If you need to halt all autonomous operations immediately:

```
/kodo:stop
```

This:

1. Sets autonomy to **guarded** (everything requires confirmation)
2. Cancels pending scheduled tasks
3. Logs the stop event to audit

This is the EU AI Act Article 14 compliant kill-switch. Kodo also has an automatic kill switch that triggers when behavioral anomalies exceed 2x the baseline threshold.

## 10. What Happens Under the Hood

Every interaction passes through Kodo's security pipeline:

```
User types a message
    │
    ├── UserPromptSubmit hook scans for injection (44 markers)
    │   └── Score >= 4 → prompt blocked
    │
    ▼
Claude selects a tool
    │
    ├── PreToolUse hook:
    │   ├── Extracts file paths from tool params
    │   ├── Checks against sensitive path blocklist
    │   ├── Classifies shell command risk (low/medium/high/critical)
    │   ├── Applies autonomy policy matrix
    │   └── Returns: allow / deny / ask
    │
    ▼
Tool executes
    │
    ├── PostToolUse hook:
    │   ├── Scans output for injection patterns
    │   ├── Normalizes Unicode, strips zero-width chars
    │   ├── Redacts confidential content
    │   ├── Guards output for XSS/SQL/code injection
    │   └── Returns: block or pass with warning
    │
    ▼
Everything logged to audit (append-only JSONL)
```

## Next Steps

- [Hooks Reference](HOOKS.md) — detailed payload schemas for all 9 hooks
- [Memory System](MEMORY.md) — how MemCells, decay, and recall work
- [Architecture](ARCHITECTURE.md) — full module map and data flows
- [Security](../SECURITY.md) — OWASP coverage and threat model
- [Troubleshooting](TROUBLESHOOTING.md) — common problems and solutions
