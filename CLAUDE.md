# Kodo — AI Instructions

## Project overview
Kodo is a Claude Code plugin providing intelligent memory, hierarchical
planning, security, and NotebookLM RAG integration. ~9K LOC TypeScript, Bun.

## Architecture
4 layers: Plugin Surface → Mode Engine / Memory Engine / Policy Kernel → Secret Vault
See docs/plans/2026-03-03-kodo-design.md for full design.

## Conventions
- TypeScript strict, no `any`
- Biome for lint+format (run `bun run check` before commit)
- bun test for all tests (run `bun test` before commit)
- Naming: camelCase for functions/vars, PascalCase for types/classes
- Files: kebab-case.ts
- One export per file preferred
- No default exports

## File structure
src/modes/       — BaseMode and all mode implementations
src/memory/      — MemCell, MemScene, Profile, BM25, recall
src/planning/    — Milestone planner, hints, library
src/security/    — Policy, vault, blocklist, injection guard, audit
src/context/     — System prompt assembly pipeline
src/rag/         — NotebookLM connector and cache
src/ui/          — Web UI server and assets
src/cli/         — CLI commands and dashboard

## Key patterns
- All modes extend BaseMode (src/modes/base-mode.ts)
- Memory uses 3-phase lifecycle: encode → consolidate → recall
- Security: 4 autonomy levels (guarded/supervised/trusted/autonomous)
- Shell commands are classified (low/medium/high/critical) before execution
- Context assembly: 6-step pipeline with token budget caps
- Sensitive paths are ALWAYS blocked, even in autonomous mode
- All external content is scanned for injection patterns before use
- Audit log is append-only JSONL, one file per day

## Testing
- Every module has corresponding test/ directory
- Security tests are mandatory: blocklist, injection, vault, risk classifier
- Run: bun test
- Coverage target: >80%

## Dependencies
Maximum 3 external: @noble/ciphers, yaml, notebooklm connector
No other deps allowed without design review.

## Security rules
- NEVER store secrets in plaintext
- NEVER bind web UI to 0.0.0.0
- NEVER skip HMAC auth on UI routes
- NEVER execute CRITICAL commands without confirmation
- ALWAYS scan external content for injection
- ALWAYS log to audit before executing
