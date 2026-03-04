# v0.5.0 Expert Feedback Response — Design Document

> **Status:** Approved
> **Created:** 2026-03-04
> **Goal:** Fix 4 confirmed bugs (including critical security bypass) and implement the AgentFactory/KnowledgeBinding architecture with Gemini File Search as primary RAG backend.

## 1. Context

An expert review identified 4 bugs and recommended architectural changes to separate agent personas, tool policies, and knowledge bindings. All 4 bugs were verified against the codebase.

## 2. Confirmed Bugs

### Bug 1: Tool name case sensitivity (CRITICAL)

**Location:** `src/hooks/cli.ts:37`
**Problem:** Claude Code sends PascalCase tool names (`"Bash"`, `"Read"`, `"Write"`). The CLI dispatcher stores them as-is. `src/plugin.ts` compares against lowercase (`"bash"`, `"read"`, etc.). All security guards are bypassed.
**Fix:** `tool.toLowerCase()` at entry point (line 37). Also normalize in PostToolUseFailure handler (line 299).

### Bug 2: config.yaml vs kodo.yaml (MEDIUM)

**Location:** `src/index.ts:32`
**Problem:** `initKodo()` writes `config.yaml`. `loadKodoConfig()` reads `kodo.yaml`. Init config is never read.
**Fix:** Change init to write `kodo.yaml`.

### Bug 3: RAG cache drops sources (MEDIUM)

**Location:** `src/rag/cache.ts`, `src/rag/connector.ts:389,162`
**Problem:** `CacheEntry` has no `sources` field. `cacheResult()` passes only `result.answer`. Cache hits return `sources: []`.
**Fix:** Extend `CacheEntry` with `sources: string[]`. Update `put()`, `cacheResult()`, and cache hit return.

### Bug 4: Decorative settings.json permissions (LOW)

**Location:** `settings.json`
**Problem:** `permissions` block is not read by any Kodo code. Claude Code ignores unknown keys.
**Fix:** Remove permissions block. Keep only `{ "agent": "code" }`.

## 3. Architecture: Agent Foundation

### 3.1 AgentTemplate (`src/agent/template.ts`)

Defines agent persona and tool policy. Maps to Claude Code's native agent spec.

```typescript
interface AgentTemplate {
  name: string;
  slug: string;
  description: string;
  tools: string[];
  disallowedTools?: string[];
  permissionMode?: "default" | "plan" | "bypassPermissions";
  skills?: string[];
  mcpServers?: string[];
  maxTurns?: number;
  instructions: string;
  autonomyLevel: string;       // kodo-specific
  memoryDepth: "full" | "summary" | "none";
  planningEnabled: boolean;
}
```

Built-in templates derived from existing modes via `modeToTemplate()` bridge.

### 3.2 KnowledgeBinding (`src/agent/binding.ts`)

Binds an agent to a knowledge source.

```typescript
interface KnowledgeBinding {
  id: string;                   // UUID
  backend: "file_search" | "notebooklm" | "none";
  resourceId: string;           // store ID or notebook ID
  metadataFilter?: Record<string, string>;
  topK?: number;
  citationPolicy: "always" | "on_demand" | "never";
  ttlMs?: number;
}
```

### 3.3 AgentInstance (`src/agent/instance.ts`)

Runtime agent = template + optional binding.

```typescript
interface AgentInstance {
  id: string;
  templateSlug: string;
  binding: KnowledgeBinding | null;
  name: string;
  createdAt: string;
  ttlMs?: number;               // ephemeral by default
  owner?: string;
}
```

### 3.4 AgentFactory (`src/agent/factory.ts`)

- `createInstance(templateSlug, binding?, name?)` → AgentInstance
- `toClaudeCodeSpec(instance)` → JSON for `--agents` format
- `writeAgentFile(instance, dir)` → `.claude/agents/generated/<name>.md`
- `listInstances()`, `removeInstance(id)`

## 4. Architecture: RAG Enhancements

### 4.1 Gemini File Search Backend (`src/rag/file-search.ts`)

Native `fetch()` to `generativelanguage.googleapis.com`. Uses `file_search_store_names` with optional `metadataFilter` and `topK`. Returns `RAGResponse` with sources.

### 4.2 Connector Strategy Extension

```typescript
type ConnectorStrategy = "mcp" | "api" | "file_search" | "none";
```

New default: `primary: "file_search"`, `fallback: "mcp"` when configured.
Backward compatible: existing `primary: "mcp"` configs still work.

### 4.3 Modes → Templates Bridge (`src/agent/bridge.ts`)

`modeToTemplate(mode: BaseMode): AgentTemplate` converts existing modes into templates. Migration path: modes continue to work, factory is additive.

## 5. New Command

`/kodo:agent create` — slash command + CLI handler to create agents dynamically.

## 6. Implementation Phases

| Phase | Scope | Files | Risk |
|-------|-------|-------|------|
| 1 | 4 bugfixes | 5 files modified | Zero |
| 2 | Agent foundation (types + factory) | 4 new + 1 bridge | Low (additive) |
| 3 | File Search + wiring + command | 3 new + 3 modified | Medium |

## 7. Testing

New test files:
- `test/agent/template.test.ts`
- `test/agent/binding.test.ts`
- `test/agent/instance.test.ts`
- `test/agent/factory.test.ts`
- `test/agent/bridge.test.ts`
- `test/rag/file-search.test.ts`

Updated test files:
- `test/hooks/cli.test.ts` (PascalCase tool names)
- `test/rag/cache.test.ts` (sources field)
- `test/rag/connector.test.ts` (file_search strategy)

## 8. Expert Recommendations Addressed

| Recommendation | Status |
|----------------|--------|
| Normalize tool names at entry point | Phase 1 |
| Fix config.yaml vs kodo.yaml | Phase 1 |
| Extend cache with sources | Phase 1 |
| Separate persona, policy, knowledge binding | Phase 2 (AgentTemplate + KnowledgeBinding) |
| Gemini File Search as primary RAG | Phase 3 |
| Modes → templates migration | Phase 3 (bridge) |
| Replace npx-per-call with persistent MCP | Deferred (v0.6.0) |
| Move tool governance to native frontmatter | Phase 2 (toClaudeCodeSpec outputs native fields) |
