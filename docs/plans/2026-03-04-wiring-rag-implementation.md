# Kodo v0.4.0 — Wiring, RAG & Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the existing memory recall pipeline into session context, implement mode extends, build NotebookLM MCP + Gemini File Search RAG with per-agent notebooks, and apply hardening fixes.

**Architecture:** Progressive branchement — each task builds independently on existing modules. Memory builder wires BM25+decay into session-start. Connector gains dual-strategy (MCP primary + Gemini HTTP fallback) with per-mode notebook binding. Hardening fixes close gaps identified by expert review.

**Tech Stack:** TypeScript strict, Bun runtime, native fetch() for Gemini API, no new dependencies.

---

## Task 1: Decay — Support `Infinity` importance

**Files:**
- Modify: `src/memory/decay.ts:24-37`
- Test: `test/memory/decay.test.ts`

**Step 1: Write the failing test**

In `test/memory/decay.test.ts`, add inside the `describe("computeRetention")` block:

```typescript
test("returns 1.0 for infinite importance (never expire)", () => {
	const now = Date.now();
	const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
	expect(computeRetention(oneYearAgo, now, Number.POSITIVE_INFINITY)).toBe(1.0);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/memory/decay.test.ts`
Expected: FAIL — `computeRetention` returns ~0 for 1 year ago, not 1.0.

**Step 3: Write minimal implementation**

In `src/memory/decay.ts`, add at line 31 (after `if (elapsed <= 0) return 1.0;`):

```typescript
if (importance === Number.POSITIVE_INFINITY) return 1.0;
```

**Step 4: Run test to verify it passes**

Run: `bun test test/memory/decay.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/memory/decay.ts test/memory/decay.test.ts
git commit -m "feat(memory): support Infinity importance for permanent memories"
```

---

## Task 2: Memory context builder

**Files:**
- Create: `src/memory/builder.ts`
- Test create: `test/memory/builder.test.ts`

**Step 1: Write the failing test**

Create `test/memory/builder.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMemoryContext } from "../../src/memory/builder";
import { createMemCell } from "../../src/memory/memcell";

describe("buildMemoryContext", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-builder-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("returns empty string when no cells exist", async () => {
		const result = await buildMemoryContext(dir, "test query");
		expect(result).toBe("");
	});

	test("returns relevant memory context for matching query", async () => {
		await createMemCell(dir, {
			episode: "Implemented OAuth2 authentication flow",
			facts: ["Uses JWT tokens", "Refresh token rotation enabled"],
			tags: ["auth", "security"],
		});
		await createMemCell(dir, {
			episode: "Fixed CSS layout bug in dashboard",
			facts: ["Flexbox alignment issue"],
			tags: ["ui", "bug"],
		});

		const result = await buildMemoryContext(dir, "authentication security");
		expect(result).toContain("OAuth2");
		expect(result).toContain("JWT");
		expect(result).not.toContain("CSS layout");
	});

	test("respects topK parameter", async () => {
		for (let i = 0; i < 10; i++) {
			await createMemCell(dir, {
				episode: `Task ${i}: implemented feature ${i}`,
				facts: [`Feature ${i} done`],
				tags: ["work"],
			});
		}

		const result = await buildMemoryContext(dir, "feature", 3);
		const lines = result.split("\n").filter((l) => l.startsWith("- "));
		expect(lines.length).toBeLessThanOrEqual(3);
	});

	test("handles directory that does not exist", async () => {
		const result = await buildMemoryContext("/nonexistent/path", "query");
		expect(result).toBe("");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/memory/builder.test.ts`
Expected: FAIL — `Cannot find module "../../src/memory/builder"`

**Step 3: Write minimal implementation**

Create `src/memory/builder.ts`:

```typescript
import { BM25Index } from "./bm25";
import { loadMemCells } from "./memcell";
import { applyDecayToScores } from "./recall";

/**
 * Build a formatted memory context string from persisted MemCells.
 *
 * Loads all valid cells, indexes them with BM25, applies importance-weighted
 * decay, and returns the top results as a markdown bullet list.
 */
export async function buildMemoryContext(
	cellsDir: string,
	query: string,
	topK = 5,
): Promise<string> {
	const cells = await loadMemCells(cellsDir);
	if (cells.length === 0) return "";

	// Build BM25 index from cell content
	const index = new BM25Index();
	for (const cell of cells) {
		const text = `${cell.episode} ${cell.facts.join(" ")}`;
		index.add(cell.id, text);
	}

	// Search
	const results = index.search(query, topK);
	if (results.length === 0) return "";

	// Apply decay weighting
	const timestamps = new Map(
		cells.map((c) => [c.id, { timestamp: c.timestamp, importance: c.importance }]),
	);
	const weighted = applyDecayToScores(results, timestamps);

	// Format as markdown
	const cellMap = new Map(cells.map((c) => [c.id, c]));
	const lines: string[] = [];
	for (const r of weighted) {
		const cell = cellMap.get(r.id);
		if (!cell) continue;
		const facts = cell.facts.length > 0 ? ` (${cell.facts.join("; ")})` : "";
		lines.push(`- ${cell.episode}${facts}`);
	}
	return lines.join("\n");
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/memory/builder.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/memory/builder.ts test/memory/builder.test.ts
git commit -m "feat(memory): add buildMemoryContext to wire BM25+decay recall"
```

---

## Task 3: Wire memory into session-start

**Files:**
- Modify: `src/hooks/session-start.ts:1-48`
- Modify: `test/hooks/session-start.test.ts`

**Step 1: Write the failing test**

In `test/hooks/session-start.test.ts`, add a new test (requires creating valid MemCells):

```typescript
test("includes recalled memory context from valid cells", async () => {
	const cellsDir = join(dir, "memory", "cells");
	await mkdir(cellsDir, { recursive: true });

	// Write a valid MemCell (with checksum)
	const { createMemCell } = await import("../../src/memory/memcell");
	await createMemCell(cellsDir, {
		episode: "Deployed v2 to production",
		facts: ["Zero downtime deployment", "Canary strategy used"],
		tags: ["deploy"],
	});

	const input: SessionStartInput = {
		sessionId: "sess_recall_001",
		source: "startup",
	};

	const result = await handleSessionStart(input, dir);
	expect(result.additionalContext).toContain("Deployed v2");
	expect(result.additionalContext).toContain("Zero downtime");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/hooks/session-start.test.ts`
Expected: FAIL — current implementation only returns cell count, not content.

**Step 3: Write minimal implementation**

Replace `src/hooks/session-start.ts`:

```typescript
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildMemoryContext } from "../memory/builder";

export interface SessionStartInput {
	sessionId: string;
	source: string; // "startup" | "resume" | "clear" | "compact"
	model?: string;
}

export interface SessionStartResult {
	additionalContext: string;
}

export async function handleSessionStart(
	input: SessionStartInput,
	baseDir: string,
): Promise<SessionStartResult> {
	const parts: string[] = [];

	// Load user profile summary if available
	const profilePath = join(baseDir, "memory", "profile.json");
	try {
		const raw = await readFile(profilePath, "utf-8");
		const profile = JSON.parse(raw) as { stableTraits?: Record<string, string> };
		if (profile.stableTraits) {
			const traits = Object.entries(profile.stableTraits)
				.map(([k, v]) => `${k}: ${v}`)
				.join(", ");
			if (traits) parts.push(`User profile: ${traits}`);
		}
	} catch {
		// No profile yet
	}

	// Build recalled memory context via BM25 + decay
	const cellsDir = join(baseDir, "memory", "cells");
	const defaultQuery = "recent project context session summary";
	const memoryContext = await buildMemoryContext(cellsDir, defaultQuery, 5);
	if (memoryContext) {
		parts.push(`Recalled memory:\n${memoryContext}`);
	} else {
		// Fallback: count cells if recall returned nothing (e.g., no matching content)
		try {
			const files = await readdir(cellsDir);
			const count = files.filter((f) => f.endsWith(".json")).length;
			if (count > 0) parts.push(`Memory: ${count} episodic cells available`);
		} catch {
			// No cells yet
		}
	}

	return {
		additionalContext: parts.length > 0 ? parts.join(". ") : "",
	};
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/hooks/session-start.test.ts`
Expected: All PASS (existing tests should still pass — the fallback count logic is preserved).

**Step 5: Run full test suite**

Run: `bun test`
Expected: All 338+ tests pass.

**Step 6: Commit**

```bash
git add src/hooks/session-start.ts test/hooks/session-start.test.ts
git commit -m "feat(hooks): wire BM25+decay recall into SessionStart context"
```

---

## Task 4: Mode `extends` inheritance

**Files:**
- Modify: `src/modes/loader.ts:1-72`
- Modify: `test/modes/loader.test.ts`

**Step 1: Write the failing tests**

In `test/modes/loader.test.ts`, add:

```typescript
test("extends inherits parent allowedTools when not specified", async () => {
	await writeFile(
		join(dir, "secure-review.yaml"),
		`
name: Secure Reviewer
slug: secure-review
extends: review
instructions: Security-focused code review
`,
	);

	const modes = await loadCustomModes(dir);
	expect(modes.length).toBe(1);
	// review mode has read-only tools: ["read", "glob", "grep"]
	expect(modes[0]?.allowedTools).toEqual(["read", "glob", "grep"]);
	expect(modes[0]?.autonomyLevel).toBe("guarded");
});

test("extends allows child to override parent properties", async () => {
	await writeFile(
		join(dir, "power-code.yaml"),
		`
name: Power Coder
slug: power-coder
extends: code
autonomy: supervised
instructions: Careful coding with supervision
`,
	);

	const modes = await loadCustomModes(dir);
	expect(modes.length).toBe(1);
	// Child overrides autonomy but inherits allowedTools from code
	expect(modes[0]?.autonomyLevel).toBe("supervised");
	expect(modes[0]?.allowedTools).toContain("bash");
	expect(modes[0]?.allowedTools).toContain("agent");
});

test("extends with invalid parent slug is skipped", async () => {
	await writeFile(
		join(dir, "bad-extends.yaml"),
		`
name: Bad Extends
slug: bad-extends
extends: nonexistent
instructions: Should not load
`,
	);

	const modes = await loadCustomModes(dir);
	expect(modes.length).toBe(0);
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test test/modes/loader.test.ts`
Expected: FAIL — extends is ignored, so "secure-review" gets default tools instead of review's read-only tools.

**Step 3: Write minimal implementation**

Modify `src/modes/loader.ts`. Add imports for built-in modes and a `getBuiltInBySlug` helper, then apply merge logic:

```typescript
// src/modes/loader.ts
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AutonomyLevel } from "../security/policy";
import { BaseMode } from "./base-mode";
import { ArchitectMode } from "./built-in/architect";
import { AskMode } from "./built-in/ask";
import { CodeMode } from "./built-in/code";
import { DebugMode } from "./built-in/debug";
import { PlanMode } from "./built-in/plan";
import { ReviewMode } from "./built-in/review";

interface YamlModeConfig {
	name: string;
	slug: string;
	extends?: string;
	autonomy?: AutonomyLevel;
	memory?: "full" | "summary" | "none";
	planning?: boolean;
	notebook?: string;
	notebook_id?: string;
	instructions: string;
	allowedTools?: string[];
}

class CustomMode extends BaseMode {
	name: string;
	slug: string;
	instructions: string;
	allowedTools: string[];
	autonomyLevel: AutonomyLevel;

	constructor(config: YamlModeConfig) {
		super();
		this.name = config.name;
		this.slug = config.slug;
		this.instructions = config.instructions;
		this.allowedTools = config.allowedTools ?? ["bash", "read", "write", "edit", "glob", "grep"];
		this.autonomyLevel = config.autonomy ?? "supervised";
		this.memoryDepth = config.memory ?? "summary";
		this.planningEnabled = config.planning ?? false;
		this.notebookId = config.notebook_id ?? null;
	}
}

const VALID_AUTONOMY: string[] = ["guarded", "supervised", "trusted", "autonomous"];
const BUILTIN_SLUGS: string[] = ["code", "architect", "ask", "debug", "plan", "review"];

function getBuiltInBySlug(slug: string): BaseMode | null {
	switch (slug) {
		case "code":
			return new CodeMode();
		case "architect":
			return new ArchitectMode();
		case "ask":
			return new AskMode();
		case "debug":
			return new DebugMode();
		case "plan":
			return new PlanMode();
		case "review":
			return new ReviewMode();
		default:
			return null;
	}
}

export async function loadCustomModes(dir: string): Promise<BaseMode[]> {
	let files: string[];
	try {
		files = await readdir(dir);
	} catch {
		return [];
	}

	const modes: BaseMode[] = [];
	for (const f of files) {
		if (!f.endsWith(".yaml") && !f.endsWith(".yml")) continue;
		try {
			const raw = await readFile(join(dir, f), "utf-8");
			const config: YamlModeConfig = parseYaml(raw);
			if (config.autonomy && !VALID_AUTONOMY.includes(config.autonomy)) {
				continue;
			}
			if (config.slug && BUILTIN_SLUGS.includes(config.slug)) {
				continue;
			}

			// Apply extends inheritance: parent provides defaults, child overrides
			if (config.extends) {
				const parent = getBuiltInBySlug(config.extends);
				if (!parent) continue; // Skip if extends references invalid slug
				if (!config.allowedTools) config.allowedTools = [...parent.allowedTools];
				if (!config.autonomy) config.autonomy = parent.autonomyLevel;
				if (!config.memory) config.memory = parent.memoryDepth;
				if (config.planning === undefined) config.planning = parent.planningEnabled;
				if (!config.notebook_id) config.notebook_id = parent.notebookId ?? undefined;
			}

			if (config.slug && config.instructions) {
				modes.push(new CustomMode(config));
			}
		} catch {
			// Skip invalid YAML
		}
	}
	return modes;
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test test/modes/loader.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/modes/loader.ts test/modes/loader.test.ts
git commit -m "feat(modes): implement extends inheritance for custom YAML modes"
```

---

## Task 5: RAG connector — dual-strategy with MCP + Gemini fallback

**Files:**
- Rewrite: `src/rag/connector.ts`
- Rewrite: `test/rag/connector.test.ts`

**Step 1: Write the failing tests**

Rewrite `test/rag/connector.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
	NotebookLMConnector,
	type ConnectorConfig,
	type RAGResponse,
} from "../../src/rag/connector";

describe("NotebookLMConnector", () => {
	test("query returns null when strategy is none", async () => {
		const conn = new NotebookLMConnector({ primary: "none" });
		const result = await conn.query("What is OAuth2?", "notebook_abc");
		expect(result).toBeNull();
	});

	test("isAvailable returns false with no backend", async () => {
		const conn = new NotebookLMConnector({ primary: "none" });
		expect(await conn.isAvailable()).toBe(false);
	});

	test("formats RAGResponse correctly", () => {
		const response: RAGResponse = {
			answer: "OAuth2 is a framework",
			sources: ["doc1.pdf", "url2"],
			confidence: 0.85,
		};
		expect(response.answer).toBeDefined();
		expect(response.sources.length).toBeGreaterThan(0);
	});

	test("api strategy requires geminiApiKey", async () => {
		const conn = new NotebookLMConnector({ primary: "api" });
		expect(await conn.isAvailable()).toBe(false);

		const conn2 = new NotebookLMConnector({
			primary: "api",
			geminiApiKey: "test-key",
			geminiStores: { default: "store_123" },
		});
		expect(await conn2.isAvailable()).toBe(true);
	});

	test("mcp strategy requires mcpServerName", async () => {
		const conn = new NotebookLMConnector({ primary: "mcp" });
		expect(await conn.isAvailable()).toBe(false);

		const conn2 = new NotebookLMConnector({
			primary: "mcp",
			mcpServerName: "notebooklm",
		});
		expect(await conn2.isAvailable()).toBe(true);
	});

	test("config accepts fallback strategy", () => {
		const config: ConnectorConfig = {
			primary: "mcp",
			fallback: "api",
			mcpServerName: "notebooklm",
			geminiApiKey: "key",
			geminiStores: { code: "store_abc" },
		};
		const conn = new NotebookLMConnector(config);
		expect(conn).toBeDefined();
	});

	test("enrich method exists", async () => {
		const conn = new NotebookLMConnector({ primary: "none" });
		const result = await conn.enrich("notebook_abc", "new content");
		expect(result).toBe(false);
	});

	test("deepResearch method exists", async () => {
		const conn = new NotebookLMConnector({ primary: "none" });
		const result = await conn.deepResearch("notebook_abc", "topic");
		expect(result).toBeNull();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/rag/connector.test.ts`
Expected: FAIL — current connector uses `strategy` not `primary`, no `enrich`/`deepResearch`.

**Step 3: Write implementation**

Rewrite `src/rag/connector.ts`:

```typescript
// src/rag/connector.ts
import { CircuitBreaker } from "../security/circuit-breaker";

export interface RAGResponse {
	answer: string;
	sources: string[];
	confidence: number;
}

export interface ConnectorConfig {
	primary: "mcp" | "api" | "none";
	fallback?: "mcp" | "api" | "none";
	mcpServerName?: string;
	geminiApiKey?: string;
	geminiStores?: Record<string, string>;
}

export class NotebookLMConnector {
	private config: ConnectorConfig;
	private primaryBreaker = new CircuitBreaker({
		name: "rag-primary",
		failureThreshold: 3,
		resetTimeout: 60_000,
	});
	private fallbackBreaker = new CircuitBreaker({
		name: "rag-fallback",
		failureThreshold: 3,
		resetTimeout: 60_000,
	});

	constructor(config: ConnectorConfig) {
		this.config = config;
	}

	async isAvailable(): Promise<boolean> {
		return this.isStrategyAvailable(this.config.primary);
	}

	async query(
		question: string,
		notebookId: string,
		modeSlug = "default",
	): Promise<RAGResponse | null> {
		// Try primary strategy
		if (this.config.primary !== "none") {
			try {
				const result = await this.primaryBreaker.execute(() =>
					this.dispatch(this.config.primary, question, notebookId, modeSlug),
				);
				if (result) return result;
			} catch {
				// Primary failed, try fallback
			}
		}

		// Try fallback strategy
		if (this.config.fallback && this.config.fallback !== "none") {
			try {
				const result = await this.fallbackBreaker.execute(() =>
					this.dispatch(this.config.fallback!, question, notebookId, modeSlug),
				);
				if (result) return result;
			} catch {
				// Fallback also failed
			}
		}

		return null;
	}

	async enrich(notebookId: string, content: string, _title?: string): Promise<boolean> {
		if (this.config.primary !== "mcp" || !this.config.mcpServerName) return false;
		try {
			await this.callMCP("add_source", { notebook_url: notebookId, content });
			return true;
		} catch {
			return false;
		}
	}

	async deepResearch(notebookId: string, topic: string): Promise<RAGResponse | null> {
		if (this.config.primary !== "mcp" || !this.config.mcpServerName) return null;
		try {
			return await this.callMCP("deep_research", {
				notebook_url: notebookId,
				topic,
			});
		} catch {
			return null;
		}
	}

	private isStrategyAvailable(strategy: "mcp" | "api" | "none"): boolean {
		switch (strategy) {
			case "mcp":
				return !!this.config.mcpServerName;
			case "api":
				return !!this.config.geminiApiKey;
			case "none":
				return false;
		}
	}

	private async dispatch(
		strategy: "mcp" | "api" | "none",
		question: string,
		notebookId: string,
		modeSlug: string,
	): Promise<RAGResponse | null> {
		switch (strategy) {
			case "mcp":
				return this.queryViaMCP(question, notebookId);
			case "api":
				return this.queryViaGemini(question, modeSlug);
			default:
				return null;
		}
	}

	private async queryViaMCP(question: string, notebookId: string): Promise<RAGResponse | null> {
		return this.callMCP("ask_question", {
			question,
			notebook_url: notebookId,
		});
	}

	private async callMCP(
		tool: string,
		args: Record<string, string>,
	): Promise<RAGResponse | null> {
		const serverName = this.config.mcpServerName;
		if (!serverName) return null;

		const proc = Bun.spawn(
			["npx", `${serverName}`, "call", tool, JSON.stringify(args)],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const output = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) return null;

		try {
			const parsed = JSON.parse(output) as { answer?: string; sources?: string[] };
			return {
				answer: parsed.answer ?? output.trim(),
				sources: parsed.sources ?? [],
				confidence: parsed.answer ? 0.8 : 0.5,
			};
		} catch {
			// If not JSON, treat raw output as the answer
			if (output.trim()) {
				return { answer: output.trim(), sources: [], confidence: 0.5 };
			}
			return null;
		}
	}

	private async queryViaGemini(
		question: string,
		modeSlug: string,
	): Promise<RAGResponse | null> {
		const apiKey = this.config.geminiApiKey;
		const storeId = this.config.geminiStores?.[modeSlug] ?? this.config.geminiStores?.default;
		if (!apiKey || !storeId) return null;

		const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
		const body = {
			contents: [{ parts: [{ text: question }] }],
			tools: [
				{
					file_search: {
						file_search_store_names: [`fileSearchStores/${storeId}`],
					},
				},
			],
		};

		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!res.ok) return null;

		const data = (await res.json()) as {
			candidates?: Array<{
				content?: { parts?: Array<{ text?: string }> };
				groundingMetadata?: {
					groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
				};
			}>;
		};

		const candidate = data.candidates?.[0];
		const answer = candidate?.content?.parts?.[0]?.text;
		if (!answer) return null;

		const sources =
			candidate?.groundingMetadata?.groundingChunks
				?.map((c) => c.web?.title ?? c.web?.uri ?? "")
				.filter((s) => s.length > 0) ?? [];

		return { answer, sources, confidence: 0.8 };
	}
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test test/rag/connector.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/rag/connector.ts test/rag/connector.test.ts
git commit -m "feat(rag): implement MCP primary + Gemini File Search fallback connector"
```

---

## Task 6: Version unification

**Files:**
- Modify: `package.json:2`
- Modify: `src/index.ts:6`
- Modify: `.claude-plugin/plugin.json:3`

**Step 1: Update all three files**

In `package.json` change `"version": "0.1.0"` to `"version": "0.4.0"`.

In `src/index.ts` change `export const PLUGIN_VERSION = "0.1.0"` to `export const PLUGIN_VERSION = "0.4.0"`.

In `.claude-plugin/plugin.json` change `"version": "0.3.0"` to `"version": "0.4.0"`.

**Step 2: Verify with grep**

Run: `grep -r "0\.1\.0\|0\.3\.0" src/ package.json .claude-plugin/`
Expected: No matches.

**Step 3: Run tests**

Run: `bun test`
Expected: All PASS.

**Step 4: Commit**

```bash
git add package.json src/index.ts .claude-plugin/plugin.json
git commit -m "chore: unify version to 0.4.0 across package.json, index.ts, plugin.json"
```

---

## Task 7: Vault.enc file permissions

**Files:**
- Modify: `src/security/vault.ts:106-111`
- Modify: `test/security/vault.test.ts`

**Step 1: Write the failing test**

In `test/security/vault.test.ts`, add:

```typescript
test("vault.enc file has owner-only permissions", async () => {
	await vault.set("perm_test", "value");
	const vaultPath = join(dir, "vault.enc");
	const st = await stat(vaultPath);
	if (process.platform !== "win32") {
		expect(st.mode & 0o777).toBe(0o600);
	}
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/security/vault.test.ts`
Expected: FAIL on non-Windows — vault.enc has default permissions (0o644).

**Step 3: Write minimal fix**

In `src/security/vault.ts`, line 109, change:

```typescript
await writeFile(tmp, JSON.stringify(data), "utf-8");
```

to:

```typescript
await writeFile(tmp, JSON.stringify(data), { encoding: "utf-8", mode: 0o600 });
```

**Step 4: Run test to verify it passes**

Run: `bun test test/security/vault.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/security/vault.ts test/security/vault.test.ts
git commit -m "fix(security): set mode 0o600 on vault.enc file"
```

---

## Task 8: Session token TTL

**Files:**
- Modify: `src/ui/auth.ts:38-44`
- Modify: `test/ui/auth.test.ts`

**Step 1: Write the failing test**

In `test/ui/auth.test.ts`, add:

```typescript
test("rejects expired session token", () => {
	const session = createSessionToken(secret);
	// With a TTL of -1ms, the token should be expired immediately
	expect(verifySessionToken(session, secret, -1)).toBe(false);
});

test("accepts session token within TTL", () => {
	const session = createSessionToken(secret);
	expect(verifySessionToken(session, secret, 86_400_000)).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test test/ui/auth.test.ts`
Expected: FAIL — `verifySessionToken` doesn't accept `ttlMs` parameter.

**Step 3: Write minimal fix**

In `src/ui/auth.ts`, modify `verifySessionToken` at line 38:

```typescript
export function verifySessionToken(
	token: string,
	secret: string,
	ttlMs = 86_400_000, // 24 hours default
): boolean {
	const lastColon = token.lastIndexOf(":");
	if (lastColon === -1) return false;
	const payload = token.slice(0, lastColon);
	const sig = token.slice(lastColon + 1);
	if (!hmacEqual(hmacSign(payload, secret), sig)) return false;
	// Extract timestamp from payload: "session:{ts}:{nonce}"
	const parts = payload.split(":");
	if (parts.length < 2) return false;
	const ts = Number.parseInt(parts[1] ?? "0");
	if (Number.isNaN(ts)) return false;
	const age = Date.now() - ts;
	return age >= 0 && age <= ttlMs;
}
```

**Step 4: Update existing test that calls verifySessionToken without TTL**

The existing `test("verifies valid session token")` calls `verifySessionToken(session, secret)` — this still works because `ttlMs` defaults to 24h. No changes needed.

**Step 5: Run tests to verify they pass**

Run: `bun test test/ui/auth.test.ts`
Expected: All PASS.

**Step 6: Commit**

```bash
git add src/ui/auth.ts test/ui/auth.test.ts
git commit -m "fix(security): add TTL enforcement to session token verification"
```

---

## Task 9: Cost tracker configurable rates

**Files:**
- Modify: `src/security/cost-tracker.ts:1-78`
- Modify: `test/security/cost-tracker.test.ts`

**Step 1: Write the failing test**

In `test/security/cost-tracker.test.ts`, add:

```typescript
test("accepts custom pricing rates", () => {
	// Opus pricing: $15 input, $75 output
	const tracker = new CostTracker({
		budgetUsd: 50,
		inputCostPerM: 15,
		outputCostPerM: 75,
	});
	tracker.record({ inputTokens: 1_000_000, outputTokens: 0 });
	expect(tracker.snapshot.estimatedCostUsd).toBe(15);
});

test("defaults to Sonnet pricing when no config provided", () => {
	const tracker = new CostTracker();
	tracker.record({ inputTokens: 1_000_000, outputTokens: 0 });
	expect(tracker.snapshot.estimatedCostUsd).toBe(3);
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test test/security/cost-tracker.test.ts`
Expected: FAIL — CostTracker constructor doesn't accept config object.

**Step 3: Write minimal implementation**

Modify `src/security/cost-tracker.ts`:

```typescript
/**
 * Session Cost Tracker
 *
 * Tracks token usage per session and enforces budget limits.
 * Default pricing uses Sonnet-class rates ($3/$15 per 1M tokens).
 * Configurable for Opus ($15/$75), Haiku ($1/$5), etc.
 */

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
}

export interface CostSnapshot {
	totalInputTokens: number;
	totalOutputTokens: number;
	estimatedCostUsd: number;
	budgetRemainingUsd: number;
	budgetExceeded: boolean;
}

export interface CostConfig {
	budgetUsd?: number;
	inputCostPerM?: number;
	outputCostPerM?: number;
}

// Sonnet-class defaults (USD per million tokens)
const DEFAULT_INPUT_COST_PER_M = 3;
const DEFAULT_OUTPUT_COST_PER_M = 15;
const DEFAULT_BUDGET_USD = 10;

export class CostTracker {
	private totalInputTokens = 0;
	private totalOutputTokens = 0;
	private readonly budgetUsd: number;
	private readonly inputCostPerM: number;
	private readonly outputCostPerM: number;

	constructor(config?: CostConfig | number) {
		if (typeof config === "number") {
			// Backward-compatible: CostTracker(10) sets budget only
			this.budgetUsd = config;
			this.inputCostPerM = DEFAULT_INPUT_COST_PER_M;
			this.outputCostPerM = DEFAULT_OUTPUT_COST_PER_M;
		} else {
			this.budgetUsd = config?.budgetUsd ?? DEFAULT_BUDGET_USD;
			this.inputCostPerM = config?.inputCostPerM ?? DEFAULT_INPUT_COST_PER_M;
			this.outputCostPerM = config?.outputCostPerM ?? DEFAULT_OUTPUT_COST_PER_M;
		}
	}

	record(usage: TokenUsage): void {
		this.totalInputTokens += usage.inputTokens;
		this.totalOutputTokens += usage.outputTokens;
	}

	get snapshot(): CostSnapshot {
		const estimatedCostUsd = this.estimateCost();
		return {
			totalInputTokens: this.totalInputTokens,
			totalOutputTokens: this.totalOutputTokens,
			estimatedCostUsd,
			budgetRemainingUsd: Math.max(0, this.budgetUsd - estimatedCostUsd),
			budgetExceeded: estimatedCostUsd >= this.budgetUsd,
		};
	}

	get isOverBudget(): boolean {
		return this.estimateCost() >= this.budgetUsd;
	}

	reset(): void {
		this.totalInputTokens = 0;
		this.totalOutputTokens = 0;
	}

	private estimateCost(): number {
		const inputCost = (this.totalInputTokens / 1_000_000) * this.inputCostPerM;
		const outputCost = (this.totalOutputTokens / 1_000_000) * this.outputCostPerM;
		return Math.round((inputCost + outputCost) * 10000) / 10000;
	}
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test test/security/cost-tracker.test.ts`
Expected: All PASS (existing tests use `CostTracker()` or `CostTracker(10)` — both still work).

**Step 5: Commit**

```bash
git add src/security/cost-tracker.ts test/security/cost-tracker.test.ts
git commit -m "feat(security): make cost tracker pricing configurable per model"
```

---

## Task 10: Lint check + full test suite

**Files:** None (validation only)

**Step 1: Run Biome check**

Run: `bun run check`
Expected: `Checked N files. No fixes applied.`

If lint errors, run `bun run check:fix` and re-verify.

**Step 2: Run full test suite**

Run: `bun test`
Expected: All tests PASS (338 original + ~15 new = ~353+).

**Step 3: Final commit if any formatting was needed**

```bash
git add -A
git commit -m "chore: fix formatting after v0.4.0 changes"
```

---

## Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Update the following sections:
- Version references: 0.1.0/0.3.0 → 0.4.0
- Memory section: document `buildMemoryContext()` and `Infinity` importance
- Mode section: document `extends` inheritance
- RAG section: document dual-strategy (MCP primary + Gemini fallback), `enrich()`, `deepResearch()`
- Security section: document vault.enc permissions, session token TTL, configurable cost rates
- Test count: update from 338 to actual count

**Step 1: Make the edits**

Update CLAUDE.md with the new module descriptions and corrected version.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for v0.4.0 — recall wiring, RAG, hardening"
```

---

## Summary

| Task | What | New/Modified Files | Estimated |
|------|------|-------------------|-----------|
| 1 | Decay Infinity | 2 files | 2 min |
| 2 | Memory builder | 2 new files | 5 min |
| 3 | Wire session-start | 2 files | 5 min |
| 4 | Mode extends | 2 files | 5 min |
| 5 | RAG connector | 2 files | 10 min |
| 6 | Version unification | 3 files | 2 min |
| 7 | Vault permissions | 2 files | 2 min |
| 8 | Session token TTL | 2 files | 5 min |
| 9 | Cost tracker config | 2 files | 5 min |
| 10 | Lint + full tests | 0 files | 2 min |
| 11 | CLAUDE.md update | 1 file | 5 min |

**Parallelizable:** Tasks 1, 4, 6, 7, 8, 9 have no dependencies on each other. Tasks 2→3 are sequential. Task 5 is independent. Task 10 runs after all others. Task 11 runs last.
