# Kodo

Intelligent Claude Code plugin with memory, planning, security, and RAG.

## Quick Start

```bash
# Install dependencies
cd kodo && bun install

# Run tests
bun test

# Lint & format check
bun run check
```

## Features

- **Intelligent Memory** — EverMemOS-inspired 3-phase memory (encode → consolidate → recall) with BM25 full-text search and cosine similarity retrieval
- **Hierarchical Planning** — HiPlan-inspired milestone roadmaps with step-wise hints and milestone library
- **Security** — OWASP Agentic 2026 compliant: Aho-Corasick prompt injection guard, XChaCha20-Poly1305 secret vault, shell risk classifier, structured audit log
- **Mode System** — 6 built-in modes (code, architect, ask, debug, plan, review) + custom YAML modes
- **NotebookLM RAG** — Context-aware retrieval from NotebookLM sources with BM25-backed cache
- **Web Dashboard** — Localhost-only SPA with HMAC-SHA256 pairing authentication
- **EU AI Act Compliant** — Kill-switch, approval workflows, append-only audit log

## Modes

| Mode | Autonomy | Planning | Tools |
|------|----------|----------|-------|
| code | trusted | yes | bash, read, write, edit, glob, grep, agent |
| architect | supervised | yes | read, glob, grep, agent |
| ask | guarded | no | read, glob, grep |
| debug | trusted | yes | bash, read, write, edit, glob, grep, agent |
| plan | guarded | yes | read, glob, grep, agent |
| review | guarded | no | read, glob, grep |

Custom modes: add YAML files to `~/.kodo/modes/`.

## Security Model

**4 Autonomy Levels:**
- **guarded** — All tool calls require confirmation
- **supervised** — Low-risk auto-approved, medium+ confirmed
- **trusted** (default) — Low+medium auto-approved, high+ confirmed
- **autonomous** — Everything auto-approved except critical

**Always Protected:**
- Sensitive files (.env, .ssh/*, credentials, private keys)
- Shell commands classified by risk (low/medium/high/critical)
- External content scanned for prompt injection (Aho-Corasick)
- Secrets encrypted at rest (XChaCha20-Poly1305)

## CLI Commands

| Command | Description |
|---------|-------------|
| `/kodo status` | Current state overview |
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

Start with `/kodo ui`. Serves on `localhost:3700` with HMAC-SHA256 pairing authentication.

Panels: Status, Plan Progress, Memory, Cost Tracking, Audit Log.

## NotebookLM RAG

Kodo integrates with NotebookLM for context-aware retrieval:
1. **MCP Server** — via notebooklm-mcp (preferred)
2. **Python Library** — via notebooklm-py
3. **Enterprise API** — via Google NotebookLM Enterprise API

Configure in `~/.kodo/config.yaml`.

## Architecture

```
Plugin Surface (hooks, CLAUDE.md, slash commands)
    ↓
Mode Engine ←→ Memory Engine ←→ Policy Kernel
    ↓              ↓                 ↓
 Planner     BM25 + MemCells    Audit + Vault
```

## Development

```bash
# Run tests
bun test

# Lint & format
bun run check

# Type check
bunx tsc --noEmit
```

## Dependencies

Only 3 external dependencies:
- `@noble/ciphers` — XChaCha20-Poly1305 encryption
- `yaml` — YAML parsing for custom modes
- NotebookLM connector (TBD)

## License

MIT
