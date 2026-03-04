# v0.5.0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 confirmed bugs (critical security bypass, config mismatch, cache provenance, decorative permissions) and build AgentFactory/KnowledgeBinding architecture with Gemini File Search as primary RAG backend.

**Architecture:** Three phases — (1) bugfixes on existing code, (2) new `src/agent/` module with types and factory, (3) File Search backend and wiring. Each phase is independently verifiable.

**Tech Stack:** TypeScript strict, Bun test runner, Biome lint, native fetch() for Gemini API

---

## Phase 1: Bugfixes

### Task 1: Fix tool name case sensitivity (CRITICAL)

**Files:**
- Modify: `src/hooks/cli.ts:37,299`
- Test: `test/hooks/cli.test.ts`

**Step 1: Write the failing test**

Add to `test/hooks/cli.test.ts`:

```typescript
test("PreToolUse normalizes PascalCase tool names to lowercase", () => {
	// Simulate Claude Code sending PascalCase "Bash"
	const input = {
		tool_name: "Bash",
		tool_input: { command: "echo hello" },
		mode: "code",
		autonomy: "guarded",
	};
	// validatePreToolInput should normalize to lowercase
	const valid = validatePreToolInput(input);
	expect(valid).toBe(true);
	expect((input as Record<string, unknown>).tool).toBe("bash");
});

test("PreToolUse normalizes PascalCase Read to lowercase", () => {
	const input = {
		tool_name: "Read",
		tool_input: { file_path: ".env" },
		mode: "code",
		autonomy: "trusted",
	};
	const valid = validatePreToolInput(input);
	expect(valid).toBe(true);
	expect((input as Record<string, unknown>).tool).toBe("read");
});
```

Note: `validatePreToolInput` is not currently exported. You'll need to export it for testing, OR test via the integration path (calling the full hook with stdin/stdout). If the function is not exported, add `export` to `function validatePreToolInput` in cli.ts.

**Step 2: Run test to verify it fails**

Run: `bun test test/hooks/cli.test.ts`
Expected: FAIL — `expect("Bash").toBe("bash")` or function not exported

**Step 3: Implement the fix**

In `src/hooks/cli.ts`, line 37:

```typescript
// Before:
(obj as Record<string, unknown>).tool = tool;

// After:
(obj as Record<string, unknown>).tool = tool.toLowerCase();
```

In `src/hooks/cli.ts`, line 299 (PostToolUseFailure handler):

```typescript
// Before:
toolName: (failInput.tool_name ?? "") as string,

// After:
toolName: ((failInput.tool_name ?? "") as string).toLowerCase(),
```

**Step 4: Run test to verify it passes**

Run: `bun test test/hooks/cli.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass (430+), 0 fail

**Step 6: Commit**

```bash
git add src/hooks/cli.ts test/hooks/cli.test.ts
git commit -m "fix(security): normalize tool names to lowercase at entry point

Claude Code sends PascalCase tool names (Bash, Read, Write).
Kodo's security guards compared against lowercase.
All file guards and shell risk classification were bypassed.

Fixes: cli.ts:37 (PreToolUse), cli.ts:299 (PostToolUseFailure)"
```

---

### Task 2: Fix config.yaml → kodo.yaml mismatch

**Files:**
- Modify: `src/index.ts:32`
- Test: `test/init.test.ts` (update existing test)

**Step 1: Update the test**

In `test/init.test.ts`, find the test that checks for `config.yaml` and change it to `kodo.yaml`:

```typescript
// Before:
expect(existsSync(join(dir, "config.yaml"))).toBe(true);

// After:
expect(existsSync(join(dir, "kodo.yaml"))).toBe(true);
```

**Step 2: Run test to verify it fails**

Run: `bun test test/init.test.ts`
Expected: FAIL — `kodo.yaml` does not exist (init writes `config.yaml`)

**Step 3: Fix src/index.ts**

Line 32:

```typescript
// Before:
const configPath = join(baseDir, "config.yaml");

// After:
const configPath = join(baseDir, "kodo.yaml");
```

**Step 4: Run test to verify it passes**

Run: `bun test test/init.test.ts`
Expected: PASS

**Step 5: Run full suite**

Run: `bun test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/index.ts test/init.test.ts
git commit -m "fix(config): init writes kodo.yaml instead of config.yaml

initKodo() wrote config.yaml but loadKodoConfig() reads kodo.yaml.
User config created by init was silently ignored."
```

---

### Task 3: Extend RAG cache with sources

**Files:**
- Modify: `src/rag/cache.ts`
- Modify: `src/rag/connector.ts:162-166,389-393`
- Test: `test/rag/cache.test.ts`

**Step 1: Write the failing test**

Add to `test/rag/cache.test.ts`:

```typescript
test("put stores sources and get returns them", async () => {
	const cache = await RAGCache.load(join(dir, "cache"));
	await cache.put("what is X?", "X is Y", "code", ["https://source1.com", "https://source2.com"]);
	const result = await cache.getWithSources("what is X?", "code");
	expect(result).not.toBeNull();
	expect(result!.answer).toBe("X is Y");
	expect(result!.sources).toEqual(["https://source1.com", "https://source2.com"]);
});

test("get still returns string for backward compat", async () => {
	const cache = await RAGCache.load(join(dir, "cache"));
	await cache.put("what is X?", "X is Y", "code", ["https://source.com"]);
	const answer = await cache.get("what is X?", "code");
	expect(answer).toBe("X is Y");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/rag/cache.test.ts`
Expected: FAIL — `put` has wrong arity, `getWithSources` doesn't exist

**Step 3: Implement the fix**

In `src/rag/cache.ts`:

1. Extend CacheEntry:

```typescript
interface CacheEntry {
	query: string;
	answer: string;
	mode: string;
	cachedAt: number;
	sources?: string[]; // Added: provenance from groundingMetadata
}
```

2. Update `put()`:

```typescript
async put(query: string, answer: string, mode: string, sources: string[] = []): Promise<void> {
	const entry: CacheEntry = { query, answer, mode, cachedAt: Date.now(), sources };
	const id = entryId(query, mode);
	this.entries.set(id, entry);
	this.index.add(id, `${mode} ${query}`);
	await this.save();
}
```

3. Add `getWithSources()`:

```typescript
async getWithSources(query: string, mode: string): Promise<{ answer: string; sources: string[] } | null> {
	const id = entryId(query, mode);
	const exact = this.entries.get(id);
	if (exact) return { answer: exact.answer, sources: exact.sources ?? [] };

	const results = this.index.search(`${mode} ${query}`, 3);
	for (const r of results) {
		const entry = this.entries.get(r.id);
		if (entry && entry.mode === mode && r.score > SIMILARITY_THRESHOLD) {
			return { answer: entry.answer, sources: entry.sources ?? [] };
		}
	}
	return null;
}
```

4. Update connector `cacheResult()` in `src/rag/connector.ts`:

```typescript
// Before:
await this.cache.put(question, result.answer, this.currentMode);

// After:
await this.cache.put(question, result.answer, this.currentMode, result.sources);
```

5. Update connector cache hit return in `src/rag/connector.ts`:

```typescript
// Before:
if (cached) {
	return { answer: cached, sources: [], confidence: 1.0 };
}

// After:
if (this.cache) {
	const cached = await this.cache.getWithSources(question, this.currentMode);
	if (cached) {
		return { answer: cached.answer, sources: cached.sources, confidence: 1.0 };
	}
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/rag/cache.test.ts`
Expected: PASS

**Step 5: Run full suite**

Run: `bun test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/rag/cache.ts src/rag/connector.ts test/rag/cache.test.ts
git commit -m "fix(rag): cache preserves sources from groundingMetadata

CacheEntry extended with sources[]. Cached responses now retain
provenance. Added getWithSources() for structured retrieval.
Connector passes sources to cache and reads them back on hit."
```

---

### Task 4: Clean up settings.json

**Files:**
- Modify: `settings.json`

**Step 1: Update settings.json**

```json
{
  "agent": "code"
}
```

Remove the decorative `permissions` block — it was not read by any Kodo code, and Claude Code ignores unknown keys in plugin settings.

**Step 2: Run smoke test**

Run: `./scripts/smoke-test.sh`
Expected: ALL CHECKS PASSED (12/12)

**Step 3: Commit**

```bash
git add settings.json
git commit -m "fix(config): remove decorative permissions from settings.json

The permissions block was not read by Kodo and Claude Code ignores
unknown keys in plugin settings. Only 'agent' is supported."
```

---

### Task 5: Phase 1 verification

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass, 0 fail

**Step 2: Run lint**

Run: `bun run check`
Expected: 0 errors

**Step 3: Run smoke test**

Run: `./scripts/smoke-test.sh`
Expected: ALL CHECKS PASSED

**Step 4: Commit phase marker**

No commit needed — individual fixes already committed.

---

## Phase 2: Agent Foundation

### Task 6: Create AgentTemplate type

**Files:**
- Create: `src/agent/template.ts`
- Create: `test/agent/template.test.ts`

**Step 1: Write test**

```typescript
import { describe, test, expect } from "bun:test";
import type { AgentTemplate } from "../../src/agent/template";
import { isValidTemplate, BUILT_IN_TEMPLATES } from "../../src/agent/template";

describe("AgentTemplate", () => {
	test("built-in templates include code, architect, debug, review, security-audit", () => {
		const slugs = BUILT_IN_TEMPLATES.map((t) => t.slug);
		expect(slugs).toContain("code");
		expect(slugs).toContain("architect");
		expect(slugs).toContain("debug");
		expect(slugs).toContain("review");
		expect(slugs).toContain("security-audit");
	});

	test("code template has trusted autonomy and full tools", () => {
		const code = BUILT_IN_TEMPLATES.find((t) => t.slug === "code")!;
		expect(code.autonomyLevel).toBe("trusted");
		expect(code.tools).toContain("bash");
		expect(code.planningEnabled).toBe(true);
	});

	test("review template has guarded autonomy and read-only tools", () => {
		const review = BUILT_IN_TEMPLATES.find((t) => t.slug === "review")!;
		expect(review.autonomyLevel).toBe("guarded");
		expect(review.tools).not.toContain("bash");
		expect(review.tools).not.toContain("write");
	});

	test("isValidTemplate rejects invalid template", () => {
		expect(isValidTemplate({})).toBe(false);
		expect(isValidTemplate({ slug: "x" })).toBe(false);
	});

	test("isValidTemplate accepts valid template", () => {
		const valid: AgentTemplate = {
			name: "Test",
			slug: "test",
			description: "test agent",
			tools: ["read"],
			instructions: "be helpful",
			autonomyLevel: "guarded",
			memoryDepth: "summary",
			planningEnabled: false,
		};
		expect(isValidTemplate(valid)).toBe(true);
	});
});
```

**Step 2: Write implementation**

```typescript
// src/agent/template.ts

export interface AgentTemplate {
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
	autonomyLevel: string;
	memoryDepth: "full" | "summary" | "none";
	planningEnabled: boolean;
}

export function isValidTemplate(v: unknown): v is AgentTemplate {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.name === "string" &&
		typeof obj.slug === "string" &&
		typeof obj.description === "string" &&
		Array.isArray(obj.tools) &&
		typeof obj.instructions === "string" &&
		typeof obj.autonomyLevel === "string" &&
		typeof obj.memoryDepth === "string" &&
		typeof obj.planningEnabled === "boolean"
	);
}

export const BUILT_IN_TEMPLATES: AgentTemplate[] = [
	{
		name: "Code",
		slug: "code",
		description: "Default coding agent with trusted autonomy and full tools",
		tools: ["bash", "read", "write", "edit", "glob", "grep", "agent"],
		instructions: "You are the default Kodo coding agent. Write clean, secure TypeScript following project conventions. Use Kodo's memory system to recall past context. Create milestone plans for non-trivial tasks.",
		autonomyLevel: "trusted",
		memoryDepth: "summary",
		planningEnabled: true,
	},
	{
		name: "Architect",
		slug: "architect",
		description: "System design agent with supervised autonomy and read-only tools",
		tools: ["read", "glob", "grep", "agent"],
		instructions: "You are Kodo's system design agent. Analyze codebase architecture and propose designs. Review module boundaries, dependencies, and data flows. Present options with trade-offs.",
		autonomyLevel: "supervised",
		memoryDepth: "full",
		planningEnabled: true,
	},
	{
		name: "Debug",
		slug: "debug",
		description: "Debugging agent with trusted autonomy and systematic approach",
		tools: ["bash", "read", "write", "edit", "glob", "grep", "agent"],
		instructions: "You are Kodo's debugging agent. Follow a systematic approach: reproduce, isolate, diagnose, fix, verify. Check audit logs for recent errors. Run tests after fixes.",
		autonomyLevel: "trusted",
		memoryDepth: "full",
		planningEnabled: true,
	},
	{
		name: "Review",
		slug: "review",
		description: "Code review agent with guarded autonomy focused on security and quality",
		tools: ["read", "glob", "grep"],
		instructions: "You are Kodo's code review agent. Review code for correctness, security vulnerabilities, and quality. Check OWASP compliance. Verify conventions and test coverage.",
		autonomyLevel: "guarded",
		memoryDepth: "summary",
		planningEnabled: false,
	},
	{
		name: "Security Audit",
		slug: "security-audit",
		description: "Security audit agent with supervised autonomy for OWASP checks",
		tools: ["read", "glob", "grep"],
		instructions: "You are Kodo's security audit agent. Audit against OWASP Agentic Top 10 and LLM Top 10. Verify injection scanner coverage, sensitive path blocklist, shell risk classification, output guard patterns, vault integrity, and memory integrity.",
		autonomyLevel: "supervised",
		memoryDepth: "summary",
		planningEnabled: false,
	},
];
```

**Step 3: Run tests**

Run: `bun test test/agent/template.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/agent/template.ts test/agent/template.test.ts
git commit -m "feat(agent): add AgentTemplate type with 5 built-in templates"
```

---

### Task 7: Create KnowledgeBinding and AgentInstance types

**Files:**
- Create: `src/agent/binding.ts`
- Create: `src/agent/instance.ts`
- Create: `test/agent/binding.test.ts`
- Create: `test/agent/instance.test.ts`

**Step 1: Write tests and implementations**

`src/agent/binding.ts`:

```typescript
export interface KnowledgeBinding {
	id: string;
	backend: "file_search" | "notebooklm" | "none";
	resourceId: string;
	metadataFilter?: Record<string, string>;
	topK?: number;
	citationPolicy: "always" | "on_demand" | "never";
	ttlMs?: number;
}

export function isValidBinding(v: unknown): v is KnowledgeBinding {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.id === "string" &&
		typeof obj.backend === "string" &&
		["file_search", "notebooklm", "none"].includes(obj.backend as string) &&
		typeof obj.resourceId === "string" &&
		typeof obj.citationPolicy === "string" &&
		["always", "on_demand", "never"].includes(obj.citationPolicy as string)
	);
}

export function createBinding(
	backend: KnowledgeBinding["backend"],
	resourceId: string,
	opts?: Partial<Pick<KnowledgeBinding, "metadataFilter" | "topK" | "citationPolicy" | "ttlMs">>,
): KnowledgeBinding {
	return {
		id: crypto.randomUUID(),
		backend,
		resourceId,
		citationPolicy: opts?.citationPolicy ?? "on_demand",
		...opts,
	};
}
```

`src/agent/instance.ts`:

```typescript
import type { KnowledgeBinding } from "./binding";

export interface AgentInstance {
	id: string;
	templateSlug: string;
	binding: KnowledgeBinding | null;
	name: string;
	createdAt: string;
	ttlMs?: number;
	owner?: string;
}

export function createInstance(
	templateSlug: string,
	name: string,
	binding?: KnowledgeBinding | null,
	ttlMs?: number,
): AgentInstance {
	return {
		id: crypto.randomUUID(),
		templateSlug,
		binding: binding ?? null,
		name,
		createdAt: new Date().toISOString(),
		ttlMs,
	};
}

export function isExpired(instance: AgentInstance): boolean {
	if (!instance.ttlMs) return false;
	const age = Date.now() - new Date(instance.createdAt).getTime();
	return age > instance.ttlMs;
}
```

Tests should verify: type guards, createBinding, createInstance, isExpired.

**Step 2: Run tests**

Run: `bun test test/agent/binding.test.ts test/agent/instance.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/agent/binding.ts src/agent/instance.ts test/agent/binding.test.ts test/agent/instance.test.ts
git commit -m "feat(agent): add KnowledgeBinding and AgentInstance types"
```

---

### Task 8: Create AgentFactory

**Files:**
- Create: `src/agent/factory.ts`
- Create: `test/agent/factory.test.ts`

**Step 1: Write test**

Tests should cover:
- `createInstance("code", "my-agent")` creates valid instance with code template
- `createInstance("code", "rag-agent", binding)` creates instance with binding
- `toClaudeCodeSpec(instance)` returns valid JSON with `name`, `tools`, `instructions`, `permissionMode`
- `writeAgentFile(instance, dir)` writes a `.md` file with YAML frontmatter
- `listInstances()` returns all instances
- `removeInstance(id)` removes by ID
- Unknown template slug throws

**Step 2: Write implementation**

`src/agent/factory.ts`:

```typescript
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KnowledgeBinding } from "./binding";
import { createInstance as createInst, type AgentInstance, isExpired } from "./instance";
import { BUILT_IN_TEMPLATES, type AgentTemplate } from "./template";

export class AgentFactory {
	private templates: Map<string, AgentTemplate>;
	private instances: AgentInstance[] = [];
	private storageDir: string;

	constructor(storageDir: string, customTemplates: AgentTemplate[] = []) {
		this.storageDir = storageDir;
		this.templates = new Map();
		for (const t of [...BUILT_IN_TEMPLATES, ...customTemplates]) {
			this.templates.set(t.slug, t);
		}
	}

	getTemplate(slug: string): AgentTemplate | undefined {
		return this.templates.get(slug);
	}

	createInstance(
		templateSlug: string,
		name: string,
		binding?: KnowledgeBinding | null,
		ttlMs?: number,
	): AgentInstance {
		const template = this.templates.get(templateSlug);
		if (!template) throw new Error(`Unknown template: ${templateSlug}`);
		const instance = createInst(templateSlug, name, binding, ttlMs);
		this.instances.push(instance);
		return instance;
	}

	toClaudeCodeSpec(instance: AgentInstance): Record<string, unknown> {
		const template = this.templates.get(instance.templateSlug);
		if (!template) throw new Error(`Unknown template: ${instance.templateSlug}`);

		const spec: Record<string, unknown> = {
			name: instance.name,
			description: template.description,
			tools: template.tools,
			instructions: template.instructions,
		};

		if (template.permissionMode) spec.permissionMode = template.permissionMode;
		if (template.disallowedTools) spec.disallowedTools = template.disallowedTools;
		if (template.skills) spec.skills = template.skills;
		if (template.mcpServers) spec.mcpServers = template.mcpServers;
		if (template.maxTurns) spec.maxTurns = template.maxTurns;

		// Inject knowledge binding context into instructions
		if (instance.binding && instance.binding.backend !== "none") {
			spec.instructions = `${template.instructions}\n\nKnowledge binding: ${instance.binding.backend} (resource: ${instance.binding.resourceId}). Citation policy: ${instance.binding.citationPolicy}.`;
		}

		return spec;
	}

	async writeAgentFile(instance: AgentInstance, dir: string): Promise<string> {
		const template = this.templates.get(instance.templateSlug);
		if (!template) throw new Error(`Unknown template: ${instance.templateSlug}`);

		await mkdir(dir, { recursive: true });
		const filename = `${instance.name.replace(/[^a-zA-Z0-9-]/g, "-")}.md`;
		const filePath = join(dir, filename);

		const lines = [
			"---",
			`name: ${instance.name}`,
			`description: ${template.description}`,
			"---",
			"",
			`# ${instance.name}`,
			"",
			template.instructions,
		];

		if (instance.binding && instance.binding.backend !== "none") {
			lines.push("");
			lines.push(`## Knowledge Source`);
			lines.push(`Backend: ${instance.binding.backend}`);
			lines.push(`Resource: ${instance.binding.resourceId}`);
			lines.push(`Citation policy: ${instance.binding.citationPolicy}`);
		}

		await writeFile(filePath, lines.join("\n") + "\n", "utf-8");
		return filePath;
	}

	listInstances(): AgentInstance[] {
		return this.instances.filter((i) => !isExpired(i));
	}

	removeInstance(id: string): boolean {
		const idx = this.instances.findIndex((i) => i.id === id);
		if (idx === -1) return false;
		this.instances.splice(idx, 1);
		return true;
	}
}
```

**Step 3: Run tests**

Run: `bun test test/agent/factory.test.ts`
Expected: PASS

**Step 4: Run full suite**

Run: `bun test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/agent/factory.ts test/agent/factory.test.ts
git commit -m "feat(agent): add AgentFactory with Claude Code spec generation"
```

---

### Task 9: Create modes → templates bridge

**Files:**
- Create: `src/agent/bridge.ts`
- Create: `test/agent/bridge.test.ts`

**Step 1: Write test**

```typescript
import { describe, test, expect } from "bun:test";
import { modeToTemplate } from "../../src/agent/bridge";
import { CodeMode } from "../../src/modes/built-in/code";
import { ReviewMode } from "../../src/modes/built-in/review";

describe("modeToTemplate", () => {
	test("converts CodeMode to template", () => {
		const mode = new CodeMode();
		const template = modeToTemplate(mode);
		expect(template.slug).toBe("code");
		expect(template.autonomyLevel).toBe("trusted");
		expect(template.tools).toContain("bash");
		expect(template.planningEnabled).toBe(true);
	});

	test("converts ReviewMode to template", () => {
		const mode = new ReviewMode();
		const template = modeToTemplate(mode);
		expect(template.slug).toBe("review");
		expect(template.autonomyLevel).toBe("guarded");
		expect(template.tools).not.toContain("bash");
		expect(template.planningEnabled).toBe(false);
	});
});
```

**Step 2: Write implementation**

```typescript
// src/agent/bridge.ts
import type { BaseMode } from "../modes/base-mode";
import type { AgentTemplate } from "./template";

export function modeToTemplate(mode: BaseMode): AgentTemplate {
	return {
		name: mode.name,
		slug: mode.slug,
		description: `${mode.name} mode — ${mode.autonomyLevel} autonomy`,
		tools: [...mode.allowedTools],
		instructions: mode.instructions,
		autonomyLevel: mode.autonomyLevel,
		memoryDepth: mode.memoryDepth,
		planningEnabled: mode.planningEnabled,
	};
}
```

**Step 3: Run tests, commit**

```bash
git add src/agent/bridge.ts test/agent/bridge.test.ts
git commit -m "feat(agent): add mode-to-template bridge for migration"
```

---

## Phase 3: RAG & Wiring

### Task 10: Create Gemini File Search backend

**Files:**
- Create: `src/rag/file-search.ts`
- Create: `test/rag/file-search.test.ts`

**Step 1: Write implementation**

`src/rag/file-search.ts`:

```typescript
import type { RAGResponse } from "./connector";

export interface FileSearchConfig {
	apiKey: string;
	storeNames: string[];
	metadataFilter?: Record<string, string>;
	topK?: number;
	model?: string;
}

export async function queryFileSearch(
	question: string,
	config: FileSearchConfig,
): Promise<RAGResponse> {
	const model = config.model ?? "gemini-2.0-flash";
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

	const body = {
		contents: [{ parts: [{ text: question }] }],
		tools: [
			{
				file_search: {
					file_search_store_names: config.storeNames,
					...(config.metadataFilter ? { dynamic_metadata_filter: config.metadataFilter } : {}),
				},
			},
		],
		generationConfig: {
			temperature: 0.2,
			maxOutputTokens: 1024,
		},
	};

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Gemini File Search failed (${response.status}): ${text}`);
	}

	const json = (await response.json()) as Record<string, unknown>;
	const candidates = json.candidates as Array<Record<string, unknown>> | undefined;
	const first = candidates?.[0];
	const content = first?.content as Record<string, unknown> | undefined;
	const parts = content?.parts as Array<Record<string, unknown>> | undefined;
	const text = (parts?.[0]?.text ?? "") as string;

	// Extract sources from grounding metadata
	const groundingMetadata = first?.groundingMetadata as Record<string, unknown> | undefined;
	const chunks = groundingMetadata?.groundingChunks as Array<Record<string, unknown>> | undefined;
	const sources: string[] = [];
	if (Array.isArray(chunks)) {
		for (const chunk of chunks) {
			const web = chunk?.web as Record<string, unknown> | undefined;
			if (typeof web?.uri === "string") {
				sources.push(web.uri);
			}
			const retrievedContext = chunk?.retrievedContext as Record<string, unknown> | undefined;
			if (typeof retrievedContext?.uri === "string") {
				sources.push(retrievedContext.uri);
			}
		}
	}

	return { answer: text, sources, confidence: 0.8 };
}
```

**Step 2: Write tests**

Tests should mock `fetch` to return Gemini-shaped responses, verify source extraction, error handling.

**Step 3: Run tests, commit**

```bash
git add src/rag/file-search.ts test/rag/file-search.test.ts
git commit -m "feat(rag): add Gemini File Search backend with source extraction"
```

---

### Task 11: Extend connector with file_search strategy

**Files:**
- Modify: `src/rag/connector.ts`
- Modify: `test/rag/connector.test.ts`

**Step 1: Add file_search to ConnectorStrategy type**

In connector.ts, find the strategy type and add "file_search":

```typescript
type ConnectorStrategy = "mcp" | "api" | "file_search" | "none";
```

**Step 2: Add tryFileSearch method**

Wire `queryFileSearch()` from `src/rag/file-search.ts` into the existing `tryStrategy()` dispatch.

**Step 3: Update tests**

Add tests for file_search strategy selection, circuit breaker integration, fallback from file_search to mcp.

**Step 4: Run tests, commit**

```bash
git add src/rag/connector.ts test/rag/connector.test.ts
git commit -m "feat(rag): extend connector with file_search strategy"
```

---

### Task 12: Create /kodo:agent command

**Files:**
- Create: `commands/agent.md`
- Modify: `src/cli/commands.ts` (add "agent" to valid commands)
- Test: `test/cli/commands.test.ts`

**Step 1: Create command markdown**

`commands/agent.md`:

```markdown
---
name: kodo:agent
description: Create and manage dynamic agents with knowledge bindings
args: <create|list|remove> [options]
---

Manage dynamic Kodo agents:

- `create <name> --template <slug> [--store <id>] [--notebook <id>]`
  Create a new agent instance from a template with optional knowledge binding.
  Templates: code, architect, debug, review, security-audit

- `list` — Show all active agent instances

- `remove <name>` — Remove an agent instance

Created agents are available in the `/agents` menu.
```

**Step 2: Add to commands.ts**

Add `"agent"` to the valid commands array.

**Step 3: Run tests, commit**

```bash
git add commands/agent.md src/cli/commands.ts test/cli/commands.test.ts
git commit -m "feat(cli): add /kodo:agent command for dynamic agent management"
```

---

### Task 13: Update docs and version

**Files:**
- Modify: `CLAUDE.md` — update module counts, add agent/ section
- Modify: `README.md` — update stats, add agent factory docs
- Modify: `CHANGELOG.md` — add 0.5.0 section
- Modify: `.claude-plugin/plugin.json` — bump to 0.5.0
- Modify: `src/index.ts` — bump PLUGIN_VERSION
- Modify: `package.json` — bump version

**Step 1: Update all version references to 0.5.0**

**Step 2: Add agent/ to CLAUDE.md file structure**

**Step 3: Add 0.5.0 changelog entries**

**Step 4: Commit**

```bash
git add CLAUDE.md README.md CHANGELOG.md .claude-plugin/plugin.json src/index.ts package.json
git commit -m "docs: update documentation for v0.5.0

- Add agent/ module documentation to CLAUDE.md
- Update README with AgentFactory and File Search docs
- Add 0.5.0 changelog entries
- Bump version to 0.5.0"
```

---

### Task 14: Final verification

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (460+), 0 fail

**Step 2: Run lint**

Run: `bun run check`
Expected: 0 errors

**Step 3: Run smoke test**

Run: `./scripts/smoke-test.sh`
Expected: ALL CHECKS PASSED

**Step 4: Verify new files**

Run: `ls src/agent/ src/rag/file-search.ts commands/agent.md`
Expected: All files present

**Step 5: Tag and push**

```bash
git tag v0.5.0
git push && git push --tags
```
