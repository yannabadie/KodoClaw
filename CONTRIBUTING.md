# Contributing to Kodo

Thank you for considering contributing to Kodo! This guide covers everything you need to get started.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- Git

## Getting Started

```bash
git clone https://github.com/yannabadie/KodoClaw.git
cd KodoClaw/kodo
bun install
bun test       # 381 tests, 808 assertions, 0 failures
bun run check  # 0 lint errors
```

## Code Conventions

### TypeScript

- **Strict mode** — no `any` types, no type assertions without type guards
- **No default exports** — use named exports exclusively
- **One export per file** preferred
- **Await all async I/O** — no fire-and-forget writes or reads
- All hook payloads MUST be validated before processing (exit code 2 on invalid input)
- All JSON deserialized from disk MUST be validated with type guards before use

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `cost-tracker.ts` |
| Functions/variables | camelCase | `classifyShellRisk()` |
| Types/classes | PascalCase | `MemCell`, `BaseMode` |
| Constants | UPPER_SNAKE_CASE | `BASE_STABILITY` |

### Biome Configuration

- **Indentation**: Tabs
- **Line width**: 100 characters
- **Rules**: Biome recommended ruleset
- Config file: `biome.json`

Run format check:

```bash
bun run check        # Check only
bun run check:fix    # Auto-fix
```

## Testing

### Structure

Every source file has a corresponding test file:

```
src/security/vault.ts    →  test/security/vault.test.ts
src/memory/memcell.ts    →  test/memory/memcell.test.ts
src/hooks/cli.ts         →  test/hooks/cli.test.ts
```

### Patterns

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ModuleName", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kodo-module-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("describes specific behavior", async () => {
    // Arrange
    const input = "test data";

    // Act
    const result = await functionUnderTest(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Rules

- Always use `{ force: true }` on `rm()` in cleanup
- Always `await` async operations — no fire-and-forget
- No mocking of core security functions — test real behavior
- Validate type guards in tests (e.g., `loadMemCells` skips invalid JSON)
- Use `mkdtemp(join(tmpdir(), "kodo-<module>-"))` for temp directories

### Running Tests

```bash
bun test                           # Run all 381 tests
bun test test/security/vault.test.ts  # Run specific test file
```

Expected output:

```
 381 pass
 0 fail
 808 expect() calls
Ran 381 tests across 48 files.
```

## Commit Workflow

### Before Every Commit

1. **Run tests**: `bun test` — must show 0 failures
2. **Run lint**: `bun run check` — must show 0 errors
3. **Review changes**: Ensure no secrets, credentials, or `.env` files are staged

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add circuit breaker to RAG connector
fix: correct stemmer rule ordering (-ation before -tion)
test: add injection scanner Unicode normalization tests
docs: update OWASP compliance table
refactor: extract path extraction from plugin handler
```

## Dependencies

Kodo maintains a strict **2 runtime dependency** maximum:

| Package | Version | Purpose |
|---------|---------|---------|
| `@noble/ciphers` | ^1.2.0 | XChaCha20-Poly1305 encryption for vault |
| `yaml` | ^2.7.0 | YAML parsing for custom mode files |

**No additional runtime dependencies** may be added without a design review. This minimizes supply chain attack surface (ASI04).

Dev dependencies:

| Package | Version | Purpose |
|---------|---------|---------|
| `@biomejs/biome` | ^1.9.0 | Lint + format |
| `@types/bun` | latest | TypeScript definitions for Bun |

## Security Rules

When contributing code, these rules are **mandatory**:

- NEVER store secrets in plaintext — use the vault (`src/security/vault.ts`)
- NEVER bind web servers to `0.0.0.0` — localhost only (`127.0.0.1`)
- NEVER skip HMAC auth on UI routes
- NEVER execute critical commands without confirmation
- NEVER auto-approve critical commands in autonomous mode
- ALWAYS scan external content for injection before processing
- ALWAYS scan user prompts for injection (UserPromptSubmit hook)
- ALWAYS scan memory writes for injection (blocks at score >= 4)
- ALWAYS scan LLM output with output guard
- ALWAYS log to audit before executing security-sensitive operations
- ALWAYS use timing-safe comparison (`timingSafeEqual`) for HMAC
- ALWAYS use atomic write-then-rename for vault and cache operations
- ALWAYS validate hook payloads before processing (exit 2 on failure)
- ALWAYS validate JSON from disk with type guards before use
- ALWAYS preserve regex flags when reconstructing patterns

## Project Structure

```
src/
├── security/      11 modules — policy kernel
├── memory/         7 modules — memory engine
├── modes/          9 modules — mode system
├── planning/       3 modules — milestone planner
├── context/        3 modules — prompt assembly
├── rag/            2 modules — NotebookLM connector
├── hooks/          8 modules — hook handlers
├── ui/             3 modules — web dashboard
├── cli/            3 modules — CLI commands
├── index.ts        — plugin initialization
└── plugin.ts       — pre/post tool handlers
```

See [Architecture](docs/ARCHITECTURE.md) for detailed module descriptions.

## Pull Request Checklist

Before submitting a PR, verify:

- [ ] `bun test` — 381+ tests pass, 0 failures
- [ ] `bun run check` — 0 lint/format errors
- [ ] New source files have corresponding test files in `test/`
- [ ] No `any` types added
- [ ] No default exports added
- [ ] All async I/O is awaited
- [ ] Hook payloads are validated (if touching hooks)
- [ ] JSON from disk is validated with type guards (if touching file I/O)
- [ ] Security rules above are followed
- [ ] Commit messages follow conventional commit format
