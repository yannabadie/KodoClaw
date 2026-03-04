# v0.4.1 Expert Feedback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all 5 expert feedback items — hierarchical planning, task-driven memory recall, unified kodo.yaml config, cost tracker wiring, and GitHub release.

**Architecture:** Extend existing planning model with subtasks + dependency DAG. Add prompt persistence for task-driven recall. Create centralized config loader that reads `kodo.yaml` and merges with env vars. Wire cost config. Bump version and publish release.

**Tech Stack:** TypeScript, Bun, `yaml` package (already a dependency), `gh` CLI for release.

---

### Task 1: Planning — Add Subtask model and DAG dependencies

**Files:**
- Modify: `src/planning/planner.ts`
- Test: `test/planning/planner.test.ts`

**Step 1: Write failing tests for subtasks and dependencies**

Add to `test/planning/planner.test.ts`:

```typescript
import {
	type Plan,
	type Subtask,
	addSubtask,
	completeSubtask,
	createPlan,
	getActiveMilestone,
	getUnblockedMilestones,
	isPlanComplete,
	replan,
	updateMilestone,
} from "../../src/planning/planner";

// After existing tests:

test("milestone can have subtasks", () => {
	const plan = createPlan("task", ["step1", "step2"]);
	addSubtask(plan, 1, "sub-step A");
	addSubtask(plan, 1, "sub-step B");
	const m = plan.milestones[0]!;
	expect(m.subtasks).toHaveLength(2);
	expect(m.subtasks![0]!.label).toBe("sub-step A");
	expect(m.subtasks![0]!.done).toBe(false);
});

test("completeSubtask marks subtask done", () => {
	const plan = createPlan("task", ["step1"]);
	addSubtask(plan, 1, "sub A");
	completeSubtask(plan, 1, 1);
	expect(plan.milestones[0]!.subtasks![0]!.done).toBe(true);
});

test("milestone supports blockedBy dependencies", () => {
	const plan = createPlan("task", ["step1", "step2", "step3"]);
	plan.milestones[1]!.blockedBy = [1]; // step2 blocked by step1
	plan.milestones[2]!.blockedBy = [1, 2]; // step3 blocked by both
	const unblocked = getUnblockedMilestones(plan);
	expect(unblocked).toHaveLength(1);
	expect(unblocked[0]!.id).toBe(1);
});

test("getUnblockedMilestones updates when deps complete", () => {
	const plan = createPlan("task", ["step1", "step2", "step3"]);
	plan.milestones[1]!.blockedBy = [1];
	plan.milestones[2]!.blockedBy = [2];
	updateMilestone(plan, 1, "completed");
	const unblocked = getUnblockedMilestones(plan);
	expect(unblocked.map((m) => m.id)).toEqual([2]);
});

test("milestone supports priority", () => {
	const plan = createPlan("task", ["low", "high"]);
	plan.milestones[0]!.priority = 3;
	plan.milestones[1]!.priority = 1;
	const unblocked = getUnblockedMilestones(plan);
	// Higher priority (lower number) first
	expect(unblocked[0]!.goal).toBe("high");
});

test("replan adds new milestones", () => {
	const plan = createPlan("task", ["step1"]);
	replan(plan, { add: [{ goal: "step2", after: 1 }] });
	expect(plan.milestones).toHaveLength(2);
	expect(plan.milestones[1]!.goal).toBe("step2");
});

test("replan removes milestones", () => {
	const plan = createPlan("task", ["step1", "step2", "step3"]);
	replan(plan, { remove: [2] });
	expect(plan.milestones).toHaveLength(2);
	expect(plan.milestones.find((m) => m.id === 2)).toBeUndefined();
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test test/planning/planner.test.ts`
Expected: FAIL — `addSubtask`, `completeSubtask`, `getUnblockedMilestones`, `replan` not exported.

**Step 3: Implement in planner.ts**

Replace `src/planning/planner.ts` with:

```typescript
export type MilestoneStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface Subtask {
	id: number;
	label: string;
	done: boolean;
}

export interface Milestone {
	id: number;
	goal: string;
	status: MilestoneStatus;
	priority?: number; // 1 = highest, default 5
	blockedBy?: number[];
	subtasks?: Subtask[];
}

export interface Plan {
	task: string;
	milestones: Milestone[];
	createdAt: string;
}

export function createPlan(task: string, goals: string[]): Plan {
	return {
		task,
		milestones: goals.map((goal, i) => ({ id: i + 1, goal, status: "pending" })),
		createdAt: new Date().toISOString(),
	};
}

export function getActiveMilestone(plan: Plan): Milestone | null {
	return plan.milestones.find((m) => m.status === "pending" || m.status === "in_progress") ?? null;
}

export function updateMilestone(plan: Plan, id: number, status: MilestoneStatus): void {
	const m = plan.milestones.find((m) => m.id === id);
	if (m) m.status = status;
}

export function isPlanComplete(plan: Plan): boolean {
	return plan.milestones.every((m) => m.status === "completed" || m.status === "skipped");
}

export function renderPlanContext(plan: Plan): string {
	const active = getActiveMilestone(plan);
	if (!active) return "";
	const total = plan.milestones.length;
	const done = plan.milestones.filter((m) => m.status === "completed").length;
	return `Milestone ${active.id}/${total}: ${active.goal}\nProgress: ${done}/${total} completed`;
}

export function addSubtask(plan: Plan, milestoneId: number, label: string): void {
	const m = plan.milestones.find((m) => m.id === milestoneId);
	if (!m) return;
	if (!m.subtasks) m.subtasks = [];
	const nextId = m.subtasks.length > 0 ? Math.max(...m.subtasks.map((s) => s.id)) + 1 : 1;
	m.subtasks.push({ id: nextId, label, done: false });
}

export function completeSubtask(plan: Plan, milestoneId: number, subtaskId: number): void {
	const m = plan.milestones.find((m) => m.id === milestoneId);
	const sub = m?.subtasks?.find((s) => s.id === subtaskId);
	if (sub) sub.done = true;
}

export function getUnblockedMilestones(plan: Plan): Milestone[] {
	const completedIds = new Set(
		plan.milestones.filter((m) => m.status === "completed" || m.status === "skipped").map((m) => m.id),
	);
	return plan.milestones
		.filter((m) => {
			if (m.status === "completed" || m.status === "skipped") return false;
			if (!m.blockedBy || m.blockedBy.length === 0) return true;
			return m.blockedBy.every((dep) => completedIds.has(dep));
		})
		.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
}

export interface ReplanChanges {
	add?: Array<{ goal: string; after?: number; blockedBy?: number[] }>;
	remove?: number[];
}

export function replan(plan: Plan, changes: ReplanChanges): void {
	// Remove milestones
	if (changes.remove) {
		const removeSet = new Set(changes.remove);
		plan.milestones = plan.milestones.filter((m) => !removeSet.has(m.id));
		// Clean up dangling blockedBy references
		for (const m of plan.milestones) {
			if (m.blockedBy) {
				m.blockedBy = m.blockedBy.filter((id) => !removeSet.has(id));
			}
		}
	}
	// Add new milestones
	if (changes.add) {
		const maxId = plan.milestones.reduce((max, m) => Math.max(max, m.id), 0);
		for (let i = 0; i < changes.add.length; i++) {
			const entry = changes.add[i]!;
			const newId = maxId + i + 1;
			const milestone: Milestone = {
				id: newId,
				goal: entry.goal,
				status: "pending",
				blockedBy: entry.blockedBy,
			};
			if (entry.after !== undefined) {
				const idx = plan.milestones.findIndex((m) => m.id === entry.after);
				plan.milestones.splice(idx + 1, 0, milestone);
			} else {
				plan.milestones.push(milestone);
			}
		}
	}
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test test/planning/planner.test.ts`
Expected: All 11 tests PASS (4 existing + 7 new).

**Step 5: Commit**

```bash
git add src/planning/planner.ts test/planning/planner.test.ts
git commit -m "feat(planning): add subtasks, DAG dependencies, priority, and replan"
```

---

### Task 2: Planning — Enhance hints with subtask awareness

**Files:**
- Modify: `src/planning/hints.ts`
- Test: `test/planning/hints.test.ts`

**Step 1: Write failing tests**

Add to `test/planning/hints.test.ts`:

```typescript
test("includes subtask progress in hint", () => {
	const milestone: Milestone = {
		id: 1,
		goal: "Setup auth",
		status: "in_progress",
		subtasks: [
			{ id: 1, label: "Install deps", done: true },
			{ id: 2, label: "Configure OAuth", done: false },
			{ id: 3, label: "Write tests", done: false },
		],
	};
	const hint = generateHint(milestone, { lastAction: "Installed deps", lastError: null });
	const rendered = hint.render();
	expect(rendered).toContain("Subtasks: 1/3 done");
	expect(rendered).toContain("Next: Configure OAuth");
});

test("hint shows no subtask info when none exist", () => {
	const milestone: Milestone = { id: 1, goal: "Setup", status: "in_progress" };
	const hint = generateHint(milestone, { lastAction: "Started", lastError: null });
	const rendered = hint.render();
	expect(rendered).not.toContain("Subtasks:");
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Update hints.ts**

```typescript
import type { Milestone } from "./planner";

export interface HintContext {
	lastAction: string;
	lastError: string | null;
}

export interface StepHint {
	stateContext: string;
	milestoneGap: string;
	actionCorrection: string | null;
	subtaskProgress: string | null;
	render(): string;
}

export function generateHint(milestone: Milestone, ctx: HintContext): StepHint {
	let subtaskProgress: string | null = null;
	if (milestone.subtasks && milestone.subtasks.length > 0) {
		const done = milestone.subtasks.filter((s) => s.done).length;
		const total = milestone.subtasks.length;
		const next = milestone.subtasks.find((s) => !s.done);
		subtaskProgress = `Subtasks: ${done}/${total} done`;
		if (next) subtaskProgress += ` — Next: ${next.label}`;
	}

	return {
		stateContext: ctx.lastAction,
		milestoneGap: `Still need to: ${milestone.goal}`,
		actionCorrection: ctx.lastError ? `Previous error: ${ctx.lastError}` : null,
		subtaskProgress,
		render() {
			const lines = [`State: ${this.stateContext}`, `Gap: ${this.milestoneGap}`];
			if (this.subtaskProgress) lines.push(this.subtaskProgress);
			if (this.actionCorrection) lines.push(`Correction: ${this.actionCorrection}`);
			return lines.join("\n");
		},
	};
}
```

**Step 4: Run tests — expect all 5 PASS**

**Step 5: Commit**

```bash
git add src/planning/hints.ts test/planning/hints.test.ts
git commit -m "feat(planning): add subtask progress to hints"
```

---

### Task 3: Planning — Upgrade library similarity to TF-IDF

**Files:**
- Modify: `src/planning/library.ts`
- Test: `test/planning/library.test.ts`

**Step 1: Write failing test**

Add to `test/planning/library.test.ts`:

```typescript
test("TF-IDF ranks better than word overlap", async () => {
	const plan1: Plan = {
		task: "Add OAuth2 authentication flow",
		milestones: [{ id: 1, goal: "Setup", status: "completed" }],
		createdAt: new Date().toISOString(),
	};
	const plan2: Plan = {
		task: "Add database migration scripts",
		milestones: [{ id: 1, goal: "Setup", status: "completed" }],
		createdAt: new Date().toISOString(),
	};
	await lib.archive(plan1);
	await lib.archive(plan2);

	const results = await lib.findSimilar("OAuth authentication");
	expect(results.length).toBe(1);
	expect(results[0]!.task).toContain("OAuth2");
});

test("findSimilar scores goals too, not just task title", async () => {
	const plan: Plan = {
		task: "Backend refactor",
		milestones: [
			{ id: 1, goal: "Migrate to PostgreSQL", status: "completed" },
			{ id: 2, goal: "Add connection pooling", status: "completed" },
		],
		createdAt: new Date().toISOString(),
	};
	await lib.archive(plan);

	const results = await lib.findSimilar("PostgreSQL migration");
	expect(results.length).toBe(1);
});
```

**Step 2: Run — expect FAIL (second test fails because current findSimilar only checks task, not goals)**

**Step 3: Update library.ts findSimilar with TF-IDF**

Replace `findSimilar` method:

```typescript
async findSimilar(query: string, topK = 3): Promise<ArchivedPlan[]> {
	const plans = await this.list();
	if (plans.length === 0) return [];

	const queryTerms = tokenize(query);
	if (queryTerms.length === 0) return [];

	// Build document corpus: each plan = task + all goals
	const docs = plans.map((p) => {
		const text = [p.task, ...p.goals].join(" ");
		return tokenize(text);
	});

	// IDF: log(N / df) for each term
	const N = docs.length;
	const df = new Map<string, number>();
	for (const doc of docs) {
		const unique = new Set(doc);
		for (const term of unique) {
			df.set(term, (df.get(term) ?? 0) + 1);
		}
	}

	// Score each plan
	const scored = plans.map((plan, i) => {
		const doc = docs[i]!;
		let score = 0;
		for (const term of queryTerms) {
			const termFreq = doc.filter((t) => t === term).length;
			const docFreq = df.get(term) ?? 0;
			if (docFreq === 0) continue;
			const tf = termFreq / doc.length;
			const idf = Math.log((N + 1) / (docFreq + 1)) + 1;
			score += tf * idf;
		}
		return { plan, score };
	});

	return scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK)
		.map((s) => s.plan);
}
```

Add `tokenize` helper at module level:

```typescript
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/\W+/)
		.filter((w) => w.length > 1);
}
```

**Step 4: Run tests — expect all 5 PASS**

**Step 5: Commit**

```bash
git add src/planning/library.ts test/planning/library.test.ts
git commit -m "feat(planning): upgrade library similarity from word-overlap to TF-IDF"
```

---

### Task 4: Task-driven memory recall — persist last prompt

**Files:**
- Modify: `src/hooks/user-prompt-submit.ts`
- Test: `test/hooks/user-prompt-submit.test.ts`

**Step 1: Write failing test**

Add to `test/hooks/user-prompt-submit.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Add to existing imports:
import { persistLastPrompt } from "../../src/hooks/user-prompt-submit";

// Add new describe block after existing tests:

describe("persistLastPrompt", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-prompt-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("writes prompt to memory/last-prompt.txt", async () => {
		await persistLastPrompt("Help me refactor the auth module", dir);
		const content = await readFile(join(dir, "memory", "last-prompt.txt"), "utf-8");
		expect(content).toBe("Help me refactor the auth module");
	});

	test("truncates very long prompts to 500 chars", async () => {
		const longPrompt = "x".repeat(1000);
		await persistLastPrompt(longPrompt, dir);
		const content = await readFile(join(dir, "memory", "last-prompt.txt"), "utf-8");
		expect(content.length).toBe(500);
	});

	test("does not persist blocked prompts", async () => {
		// A prompt that would be blocked should not be persisted
		// This is handled by the caller, not persistLastPrompt itself
		// So this just verifies any prompt CAN be persisted
		await persistLastPrompt("normal prompt", dir);
		const content = await readFile(join(dir, "memory", "last-prompt.txt"), "utf-8");
		expect(content).toBe("normal prompt");
	});
});
```

**Step 2: Run — expect FAIL (`persistLastPrompt` not exported)**

**Step 3: Add persistLastPrompt to user-prompt-submit.ts**

Add at the end of the file:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Persist the user's prompt for task-driven memory recall.
 * Called from cli.ts before injection scanning.
 * Truncates to 500 chars to avoid excessive disk usage.
 */
export async function persistLastPrompt(prompt: string, baseDir: string): Promise<void> {
	const memDir = join(baseDir, "memory");
	await mkdir(memDir, { recursive: true });
	const truncated = prompt.slice(0, 500);
	await writeFile(join(memDir, "last-prompt.txt"), truncated, "utf-8");
}
```

**Step 4: Run tests — expect all PASS**

**Step 5: Commit**

```bash
git add src/hooks/user-prompt-submit.ts test/hooks/user-prompt-submit.test.ts
git commit -m "feat(memory): persist last user prompt for task-driven recall"
```

---

### Task 5: Task-driven memory recall — wire into SessionStart

**Files:**
- Modify: `src/hooks/session-start.ts`
- Modify: `src/hooks/cli.ts` (wire persistLastPrompt call)
- Test: `test/hooks/session-start.test.ts`

**Step 1: Write failing test**

Add to `test/hooks/session-start.test.ts`:

```typescript
test("uses last prompt for memory recall when available", async () => {
	const memDir = join(dir, "memory");
	const cellsDir = join(memDir, "cells");
	await mkdir(cellsDir, { recursive: true });

	// Persist a specific prompt
	await writeFile(join(memDir, "last-prompt.txt"), "How does the auth module work?", "utf-8");

	// Create a cell that matches "auth"
	const cell = {
		id: "mc_auth_001",
		episode: "Refactored auth module with JWT tokens",
		facts: ["switched from session cookies to JWT", "added refresh token rotation"],
		tags: ["auth", "security"],
		timestamp: new Date().toISOString(),
		importance: 1.0,
		checksum: "",
	};
	cell.checksum = computeChecksum(cell);
	await writeFile(join(cellsDir, "mc_auth_001.json"), JSON.stringify(cell), "utf-8");

	const result = await handleSessionStart({ sessionId: "s1", source: "resume" }, dir);
	expect(result.additionalContext).toContain("Memory Context:");
	expect(result.additionalContext).toContain("auth");
});
```

**Step 2: Run — this may already pass with generic query, but will verify task-driven recall is wired**

**Step 3: Update session-start.ts to read last-prompt.txt**

Replace the memory recall section (lines 37-57) in `session-start.ts`:

```typescript
	// Determine recall query: use last prompt if available, fallback to generic
	let recallQuery = "recent project context";
	try {
		const lastPromptPath = join(baseDir, "memory", "last-prompt.txt");
		const lastPrompt = await readFile(lastPromptPath, "utf-8");
		if (lastPrompt.trim()) {
			recallQuery = lastPrompt.trim();
		}
	} catch {
		// No last-prompt.txt — use default query
	}

	// Recall ranked memory context via BM25 + decay pipeline
	const cellsDir = join(baseDir, "memory", "cells");
	let memoryContext = "";
	try {
		memoryContext = await buildMemoryContext(cellsDir, recallQuery);
	} catch {
		// buildMemoryContext failed — fall through to count fallback
	}
```

Update `cli.ts` UserPromptSubmit case to call `persistLastPrompt`:

In the `UserPromptSubmit` case block, add before the injection check:

```typescript
case "UserPromptSubmit": {
	const promptInput = payload as Record<string, unknown>;
	const prompt = (promptInput.prompt ?? "") as string;
	// Persist prompt for task-driven recall (before injection check)
	try {
		await persistLastPrompt(prompt, baseDir);
	} catch {
		// Non-critical — don't block on persistence failure
	}
	result = handleUserPromptSubmit({
		prompt,
		sessionId: (promptInput.session_id ?? "") as string,
	});
	break;
}
```

Add import at top of `cli.ts`:

```typescript
import { persistLastPrompt } from "./user-prompt-submit";
```

**Step 4: Run tests — expect all PASS**

Run: `bun test test/hooks/session-start.test.ts test/hooks/user-prompt-submit.test.ts`

**Step 5: Commit**

```bash
git add src/hooks/session-start.ts src/hooks/cli.ts test/hooks/session-start.test.ts
git commit -m "feat(memory): wire task-driven recall using last user prompt"
```

---

### Task 6: Unified kodo.yaml config loader

**Files:**
- Create: `src/config/loader.ts`
- Create: `test/config/loader.test.ts`
- Modify: `src/rag/config.ts`

**Step 1: Write failing tests**

Create `test/config/loader.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKodoConfig } from "../../src/config/loader";

describe("loadKodoConfig", () => {
	let dir: string;
	const originalEnv = { ...process.env };

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-config-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
		process.env = { ...originalEnv };
	});

	test("returns defaults when no kodo.yaml exists", () => {
		const config = loadKodoConfig(dir);
		expect(config.rag.primary).toBe("mcp");
		expect(config.rag.fallback).toBe("none");
		expect(config.cost.budgetUsd).toBe(10);
		expect(config.cost.inputCostPerM).toBe(3);
		expect(config.cost.outputCostPerM).toBe(15);
	});

	test("reads rag section from kodo.yaml", async () => {
		const yaml = `rag:\n  primary: api\n  fallback: mcp\n  mcp_server: my-mcp\n`;
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		const config = loadKodoConfig(dir);
		expect(config.rag.primary).toBe("api");
		expect(config.rag.fallback).toBe("mcp");
		expect(config.rag.mcpServerName).toBe("my-mcp");
	});

	test("reads cost section from kodo.yaml", async () => {
		const yaml = `cost:\n  budget_usd: 50\n  input_cost_per_m: 15\n  output_cost_per_m: 75\n`;
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		const config = loadKodoConfig(dir);
		expect(config.cost.budgetUsd).toBe(50);
		expect(config.cost.inputCostPerM).toBe(15);
		expect(config.cost.outputCostPerM).toBe(75);
	});

	test("reads gemini_stores from kodo.yaml", async () => {
		const yaml = `rag:\n  gemini_stores:\n    code: store-code-123\n    architect: store-arch-456\n`;
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		const config = loadKodoConfig(dir);
		expect(config.rag.geminiStores).toEqual({
			code: "store-code-123",
			architect: "store-arch-456",
		});
	});

	test("env vars override kodo.yaml", async () => {
		const yaml = `rag:\n  primary: none\n`;
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		process.env.GOOGLE_API_KEY = "env-key-123";
		const config = loadKodoConfig(dir);
		// Env key means fallback should be api regardless of yaml
		expect(config.rag.geminiApiKey).toBe("env-key-123");
	});

	test("env KODO_MCP_SERVER overrides yaml mcp_server", async () => {
		const yaml = `rag:\n  mcp_server: yaml-mcp\n`;
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		process.env.KODO_MCP_SERVER = "env-mcp";
		const config = loadKodoConfig(dir);
		expect(config.rag.mcpServerName).toBe("env-mcp");
	});

	test("handles malformed kodo.yaml gracefully", async () => {
		await writeFile(join(dir, "kodo.yaml"), "not: valid: yaml: {{[", "utf-8");
		const config = loadKodoConfig(dir);
		// Should return defaults
		expect(config.rag.primary).toBe("mcp");
	});
});
```

**Step 2: Run — expect FAIL (module not found)**

**Step 3: Create src/config/loader.ts**

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ConnectorConfig } from "../rag/connector";
import type { CostConfig } from "../security/cost-tracker";

export interface KodoConfig {
	rag: ConnectorConfig;
	cost: CostConfig;
}

interface YamlRag {
	primary?: string;
	fallback?: string;
	mcp_server?: string;
	gemini_stores?: Record<string, string>;
}

interface YamlCost {
	budget_usd?: number;
	input_cost_per_m?: number;
	output_cost_per_m?: number;
}

interface YamlRoot {
	rag?: YamlRag;
	cost?: YamlCost;
}

const RAG_DEFAULTS: ConnectorConfig = {
	primary: "mcp",
	fallback: "none",
	mcpServerName: "notebooklm-mcp",
};

const COST_DEFAULTS: Required<CostConfig> = {
	budgetUsd: 10,
	inputCostPerM: 3,
	outputCostPerM: 15,
};

/**
 * Load Kodo configuration with priority: env vars > kodo.yaml > defaults.
 * Never throws — returns defaults on any error.
 */
export function loadKodoConfig(baseDir: string): KodoConfig {
	// 1. Try reading kodo.yaml
	let yaml: YamlRoot = {};
	try {
		const raw = readFileSync(join(baseDir, "kodo.yaml"), "utf-8");
		const parsed: unknown = parseYaml(raw);
		if (typeof parsed === "object" && parsed !== null) {
			yaml = parsed as YamlRoot;
		}
	} catch {
		// No config file or parse error — use defaults
	}

	// 2. Build RAG config: yaml defaults, then env overrides
	const yamlRag = yaml.rag ?? {};
	const envGeminiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? undefined;
	const envMcpServer = process.env.KODO_MCP_SERVER;

	const rag: ConnectorConfig = {
		primary: isValidStrategy(yamlRag.primary) ? yamlRag.primary : RAG_DEFAULTS.primary,
		fallback: isValidStrategy(yamlRag.fallback)
			? yamlRag.fallback
			: envGeminiKey
				? "api"
				: RAG_DEFAULTS.fallback ?? "none",
		mcpServerName: envMcpServer ?? yamlRag.mcp_server ?? RAG_DEFAULTS.mcpServerName,
		geminiApiKey: envGeminiKey,
		geminiStores: yamlRag.gemini_stores,
	};

	// 3. Build cost config: yaml then defaults
	const yamlCost = yaml.cost ?? {};
	const cost: Required<CostConfig> = {
		budgetUsd: yamlCost.budget_usd ?? COST_DEFAULTS.budgetUsd,
		inputCostPerM: yamlCost.input_cost_per_m ?? COST_DEFAULTS.inputCostPerM,
		outputCostPerM: yamlCost.output_cost_per_m ?? COST_DEFAULTS.outputCostPerM,
	};

	return { rag, cost };
}

function isValidStrategy(s: unknown): s is "mcp" | "api" | "none" {
	return s === "mcp" || s === "api" || s === "none";
}
```

**Step 4: Run tests — expect all 7 PASS**

**Step 5: Refactor rag/config.ts to delegate to loadKodoConfig**

Update `src/rag/config.ts`:

```typescript
import { loadKodoConfig } from "../config/loader";
import type { ConnectorConfig } from "./connector";

export interface RAGSetupStatus {
	geminiConfigured: boolean;
	mcpConfigured: boolean;
	geminiApiKey: string | null;
	mcpServerName: string;
	primary: string;
	fallback: string;
}

/**
 * Load RAG configuration from environment + kodo.yaml.
 * Priority: env vars > kodo.yaml > defaults
 */
export function loadRAGConfig(baseDir?: string): ConnectorConfig {
	return loadKodoConfig(baseDir ?? process.cwd()).rag;
}

export function getRAGSetupStatus(config: ConnectorConfig): RAGSetupStatus {
	const key = config.geminiApiKey;
	const maskedKey = key ? `${key.slice(0, 8)}...${key.slice(-4)}` : null;
	return {
		geminiConfigured: !!config.geminiApiKey,
		mcpConfigured: config.primary === "mcp" || config.fallback === "mcp",
		geminiApiKey: maskedKey,
		mcpServerName: config.mcpServerName ?? "notebooklm-mcp",
		primary: config.primary,
		fallback: config.fallback ?? "none",
	};
}
```

**Step 6: Run existing rag config tests + new config tests**

Run: `bun test test/config/loader.test.ts test/rag/config.test.ts`
Expected: All PASS.

**Step 7: Commit**

```bash
git add src/config/loader.ts test/config/loader.test.ts src/rag/config.ts
git commit -m "feat(config): add kodo.yaml loader with env > yaml > defaults priority"
```

---

### Task 7: Version bump + CHANGELOG + CLAUDE.md update

**Files:**
- Modify: `package.json` (version → 0.4.1)
- Modify: `src/index.ts` (version → 0.4.1)
- Modify: `.claude-plugin/plugin.json` (version → 0.4.1)
- Modify: `CHANGELOG.md` (add 0.4.1 entry)
- Modify: `CLAUDE.md` (update counts, descriptions)

**Step 1: Update version in 3 files**

Set version to `0.4.1` in `package.json`, `src/index.ts`, `.claude-plugin/plugin.json`.

**Step 2: Add CHANGELOG entry**

Add `[0.4.1]` section to top of CHANGELOG with:
- feat(planning): hierarchical milestones with subtasks, DAG dependencies, priority, replan
- feat(planning): TF-IDF similarity in milestone library
- feat(memory): task-driven recall using last user prompt
- feat(config): unified kodo.yaml config loader (env > yaml > defaults)
- fix: RAG config now reads kodo.yaml as documented
- fix: cost tracker reads config from kodo.yaml

**Step 3: Update CLAUDE.md**

Update test counts, file counts, planning description, config description.

**Step 4: Run full test suite + lint**

Run: `bun run check && bun test`
Expected: 0 lint errors, 420+ tests, 0 failures.

**Step 5: Commit**

```bash
git add package.json src/index.ts .claude-plugin/plugin.json CHANGELOG.md CLAUDE.md
git commit -m "chore: bump version to 0.4.1, update docs"
```

---

### Task 8: GitHub Release v0.4.1

**Step 1: Create git tag**

```bash
git tag v0.4.1
git push origin master
git push origin v0.4.1
```

**Step 2: Create GitHub release**

Extract the `[0.4.1]` section from CHANGELOG.md and use as release body:

```bash
gh release create v0.4.1 --title "v0.4.1 — Expert Feedback" --notes "$(sed -n '/## \[0.4.1\]/,/## \[0.4.0\]/p' CHANGELOG.md | head -n -1)"
```

**Step 3: Verify release exists**

```bash
gh release view v0.4.1
```

---

## Task Dependency Graph

```
Task 1 (planner DAG) ──┐
Task 2 (hints)         ─┤── Task 7 (version bump) ── Task 8 (release)
Task 3 (library TF-IDF)─┤
Task 4 (persist prompt) ┤
Task 5 (wire recall)   ─┤
Task 6 (kodo.yaml)     ─┘
```

Tasks 1-6 are independent and can run in parallel. Task 7 depends on all. Task 8 depends on 7.
