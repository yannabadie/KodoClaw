# Kodo v0.4.0 — Wiring, RAG & Hardening Design

**Date**: 2026-03-04
**Author**: Yann Abadie + Claude
**Status**: Approved

## Objective

Close the gap between existing components and their actual wiring. Four axes:
1. Wire the memory recall pipeline into session context
2. Implement `extends` inheritance for custom YAML modes
3. Implement NotebookLM RAG (MCP primary + Gemini File Search fallback)
4. Apply hardening fixes identified by expert review

## Approach

Progressive branchement — each step builds on the previous, independently testable.

---

## 1. Memory Recall Pipeline Wiring

### Problem
BM25, decay, recall, memcell modules all exist but are never called from session-start or the context assembler. SessionStart returns only a cell count string.

### Solution

**New file**: `src/memory/builder.ts`

```typescript
export async function buildMemoryContext(
  cellsDir: string,
  query: string,
  topK?: number   // default 5
): Promise<string>
```

**Flow**:
1. `loadMemCells(cellsDir)` → all validated cells
2. Build `BM25Index`, add each cell: `cell.episode + " " + cell.facts.join(" ")`
3. `index.search(query, topK)` → ranked results
4. Build `cellTimestamps` map from cells (`{ timestamp, importance }`)
5. `applyDecayToScores(results, cellTimestamps)` → decay-weighted scores
6. Format top results as markdown bullet list with scores

**Modified file**: `src/hooks/session-start.ts`
- Call `buildMemoryContext(cellsDir, "recent project context")`
- Include result in `additionalContext` alongside profile traits
- Graceful degradation: if no cells exist, fall back to count-only string

**No changes to `assembler.ts`** — it already accepts `memoryContext: string`.

### Test
- `test/memory/builder.test.ts` — unit tests for the new builder
- Update `test/hooks/session-start.test.ts` — verify memory context in output

---

## 2. Mode `extends` Inheritance

### Problem
`YamlModeConfig.extends` is declared but ignored by `loadCustomModes()`.

### Solution

**Modified file**: `src/modes/loader.ts`

Add a `getBuiltInBySlug(slug)` helper that returns a built-in mode instance.
In `loadCustomModes()`, after YAML parsing, if `config.extends` is set:

```typescript
if (config.extends) {
  const parent = getBuiltInBySlug(config.extends);
  if (!parent) continue; // skip invalid extends
  config.instructions = config.instructions ?? parent.instructions;
  config.allowedTools = config.allowedTools ?? [...parent.allowedTools];
  config.autonomy = config.autonomy ?? parent.autonomyLevel;
  config.memory = config.memory ?? parent.memoryDepth;
  config.planning = config.planning ?? parent.planningEnabled;
  config.notebook_id = config.notebook_id ?? parent.notebookId;
}
```

~25 lines of merge logic.

### Test
- `test/modes/loader.test.ts` — add tests:
  - YAML with `extends: review` inherits read-only tools
  - YAML with `extends: code` + explicit `autonomy: supervised` overrides parent
  - Invalid extends slug is skipped gracefully

---

## 3. RAG — NotebookLM MCP + Gemini File Search Fallback

### Vision
Each custom YAML mode binds to a NotebookLM notebook (`notebook_id`). The agent can:
- **Query** its notebook (ask_question)
- **Enrich** its notebook (deep_research, add_source)

```yaml
# modes/aerospace-expert.yaml
name: Aerospace Manufacturing Expert
slug: aerospace
extends: architect
notebook_id: "https://notebooklm.google.com/notebook/abc123"
instructions: |
  Expert in aerospace manufacturing (AS9100, NADCAP, ITAR).
  Use your NotebookLM knowledge base for every response.
```

### Architecture

```
Question + mode.notebookId
       ↓
  RAGCache.get() ── hit ──→ return cached
       ↓ miss
  Primary: NotebookLM MCP ────────────────┐
    tool: ask_question { question, url }   │
    Circuit breaker (3 fails → open)       │
  ─────────────────────────────────────────┘
       ↓ circuit breaker open
  Fallback: Gemini File Search ────────────┐
    HTTP fetch() to googleapis.com         │
    API key auth (no session expiry)       │
    Store per mode (geminiStores mapping)  │
  ─────────────────────────────────────────┘
       ↓ success
  RAGCache.put() → return RAGResponse
```

### Connector Changes

**Modified**: `src/rag/connector.ts`

```typescript
interface ConnectorConfig {
  primary: "mcp" | "api" | "none";
  fallback?: "mcp" | "api" | "none";
  mcpServerName?: string;           // MCP server name for notebooklm
  geminiApiKey?: string;            // Gemini API key for fallback
  geminiStores?: Record<string, string>;  // { modeSlug: storeId }
}

export class NotebookLMConnector {
  // Existing (to implement)
  async query(question: string, notebookId: string): Promise<RAGResponse | null>

  // New methods
  async enrich(notebookId: string, content: string, title?: string): Promise<boolean>
  async deepResearch(notebookId: string, topic: string): Promise<RAGResponse | null>

  // Strategy implementations
  private async queryViaMCP(question: string, notebookId: string): Promise<RAGResponse | null>
  private async queryViaAPI(question: string, storeId: string): Promise<RAGResponse | null>
}
```

### MCP Strategy (`queryViaMCP`)

Uses the notebooklm-mcp server (PleasePrompto/notebooklm-mcp or jacob-bd/notebooklm-mcp-cli).

The MCP server must be pre-installed and configured by the user. Kodo calls it via subprocess:

```typescript
private async queryViaMCP(question: string, notebookId: string): Promise<RAGResponse | null> {
  const proc = Bun.spawn(["npx", "notebooklm-mcp", "call", "ask_question",
    JSON.stringify({ question, notebook_url: notebookId })]);
  const output = await new Response(proc.stdout).text();
  // Parse JSON → RAGResponse { answer, sources, confidence }
}
```

Enrich and deep research follow the same pattern with different MCP tool names.

### Gemini File Search Strategy (`queryViaAPI`)

Uses native `fetch()` (Bun built-in). Zero new dependencies.

```typescript
private async queryViaAPI(question: string, storeId: string): Promise<RAGResponse | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.config.geminiApiKey}`;
  const body = {
    contents: [{ parts: [{ text: question }] }],
    tools: [{
      file_search: {
        file_search_store_names: [`fileSearchStores/${storeId}`]
      }
    }]
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  // Extract answer from candidates[0].content.parts[0].text
  // Extract sources from groundingMetadata.groundingChunks
  // Compute confidence from groundingMetadata.groundingSupports
  return { answer, sources, confidence };
}
```

### Query Flow with Dual Circuit Breakers

```typescript
async query(question: string, notebookId: string): Promise<RAGResponse | null> {
  // 1. Check cache
  const cached = await this.cache?.get(question, this.currentMode);
  if (cached) return { answer: cached, sources: [], confidence: 1.0 };

  // 2. Try primary
  let result: RAGResponse | null = null;
  if (this.config.primary !== "none") {
    result = await this.primaryBreaker.call(() =>
      this.dispatch(this.config.primary, question, notebookId)
    );
  }

  // 3. Fallback if primary failed
  if (!result && this.config.fallback && this.config.fallback !== "none") {
    const storeId = this.config.geminiStores?.[this.currentMode] ?? notebookId;
    result = await this.fallbackBreaker.call(() =>
      this.dispatch(this.config.fallback!, question, storeId)
    );
  }

  // 4. Cache successful result
  if (result) {
    await this.cache?.put(question, result.answer, this.currentMode);
  }

  return result;
}
```

### Security Integration

All RAG responses go through:
1. `scanForInjection()` — Aho-Corasick scan on answer text
2. `scanOutput()` — output guard for XSS/SQL/code patterns
3. `redactConfidential()` — strip any leaked secrets

This is already wired in `plugin.ts` PostToolUse but needs to be explicitly called in the connector for RAG content.

### Test
- `test/rag/connector.test.ts` — expand with:
  - Primary MCP query success
  - Primary fails → fallback to Gemini
  - Both fail → return null
  - Enrich and deepResearch methods
  - Security scanning on RAG responses
- Mock MCP subprocess calls and fetch() for unit tests

---

## 4. Hardening Fixes

### 4a. Version Unification
- `package.json`: `"version": "0.4.0"`
- `src/index.ts`: `PLUGIN_VERSION = "0.4.0"`
- `.claude-plugin/plugin.json`: `"version": "0.4.0"`

### 4b. Vault Permissions
**File**: `src/security/vault.ts`
- Add `mode: 0o600` to `writeFile()` for `vault.enc` (not just `.vault_key`)

### 4c. Session Token TTL
**File**: `src/ui/auth.ts`
- Add TTL check to `verifySessionToken()` matching pairing token pattern
- Default TTL: 24 hours (configurable)

### 4d. Cost Tracker Model-Awareness
**File**: `src/security/cost-tracker.ts`

```typescript
export interface CostConfig {
  inputCostPerM?: number;   // default 3 (Sonnet)
  outputCostPerM?: number;  // default 15 (Sonnet)
  budgetUsd?: number;       // default 10
}
```

Replace hardcoded constants with configurable `CostConfig`.

### 4e. Decay "Never Expire"
**File**: `src/memory/decay.ts`

In `computeRetention()`:
```typescript
if (importance === Number.POSITIVE_INFINITY) return 1.0;
```

Convention: `importance: Infinity` = architectural decisions that must never decay.

### Tests for All Fixes
- `test/security/vault.test.ts` — verify vault.enc has mode 0o600
- `test/ui/auth.test.ts` — verify session token expires after TTL
- `test/security/cost-tracker.test.ts` — verify configurable rates
- `test/memory/decay.test.ts` — verify Infinity importance → retention 1.0

---

## Dependencies

**No new runtime dependencies.** Gemini File Search uses native `fetch()`.

**External tools** (user must install):
- NotebookLM MCP server (e.g., `npx notebooklm-mcp`) — for primary RAG strategy
- Gemini API key — for fallback RAG strategy

---

## Implementation Order

| Step | Files | Depends On | Estimated Effort |
|------|-------|------------|-----------------|
| 1 | `src/memory/builder.ts` (new) + tests | Nothing | Small |
| 2 | `src/hooks/session-start.ts` (modify) + tests | Step 1 | Small |
| 3 | `src/modes/loader.ts` (modify) + tests | Nothing | Small |
| 4 | `src/rag/connector.ts` (implement MCP) + tests | Nothing | Medium |
| 5 | `src/rag/connector.ts` (implement Gemini fallback) + tests | Nothing | Medium |
| 6 | `src/rag/connector.ts` (enrich + deepResearch) + tests | Step 4 | Medium |
| 7 | Version unification | Nothing | Trivial |
| 8 | Vault permissions fix + tests | Nothing | Trivial |
| 9 | Session token TTL + tests | Nothing | Small |
| 10 | Cost tracker config + tests | Nothing | Small |
| 11 | Decay infinity + tests | Nothing | Trivial |

Steps 1-3, 4-5, 7-11 can be parallelized.

---

## Success Criteria

- [ ] `bun test` — all tests pass (338 existing + new tests)
- [ ] `bun run check` — zero lint errors
- [ ] SessionStart returns real memory context (not just count)
- [ ] Custom YAML with `extends` inherits parent mode properties
- [ ] RAG MCP query works with notebooklm-mcp server
- [ ] RAG falls back to Gemini File Search when MCP circuit breaker opens
- [ ] Agent can enrich notebook via deep research
- [ ] All versions unified at 0.4.0
- [ ] Vault.enc written with mode 0o600
- [ ] Session tokens expire after TTL
- [ ] Cost tracker accepts configurable rates
- [ ] `importance: Infinity` prevents memory decay
