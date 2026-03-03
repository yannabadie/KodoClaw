import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initKodo } from "../src/index";
import { Vault } from "../src/security/vault";
import { createMemCell, loadMemCells } from "../src/memory/memcell";
import { consolidate, loadMemScenes } from "../src/memory/memscene";
import { UserProfile } from "../src/memory/profile";
import { BM25Index } from "../src/memory/bm25";
import { assembleContext } from "../src/context/assembler";
import { handlePreToolUse } from "../src/plugin";

describe("integration: full Kodo lifecycle", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-integration-"));
		await initKodo(dir);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("init → encode memory → consolidate → recall → assemble", async () => {
		// 1. Create MemCells
		const cellsDir = join(dir, "memory/cells");
		const cell1 = await createMemCell(cellsDir, {
			episode: "Set up Express with JWT auth",
			facts: ["Express backend", "JWT tokens", "PostgreSQL"],
			tags: ["auth", "express", "setup"],
		});
		const cell2 = await createMemCell(cellsDir, {
			episode: "Added session-based auth fallback",
			facts: ["Session cookies", "Redis store"],
			tags: ["auth", "session"],
		});

		// 2. Consolidate into scenes
		const scenesDir = join(dir, "memory/scenes");
		await consolidate(scenesDir, cell1, []);
		const scenes1 = await loadMemScenes(scenesDir);
		await consolidate(scenesDir, cell2, scenes1);
		const scenes2 = await loadMemScenes(scenesDir);
		expect(scenes2.length).toBeGreaterThanOrEqual(1);

		// 3. Build BM25 index over cells
		const cells = await loadMemCells(cellsDir);
		const idx = new BM25Index();
		for (const c of cells) idx.add(c.id, c.facts.join(" "));
		const results = idx.search("JWT authentication");
		expect(results.length).toBeGreaterThan(0);

		// 4. Load profile
		const profile = await UserProfile.load(join(dir, "memory/profile.json"));
		await profile.setTrait("stack", "TypeScript, Express");

		// 5. Assemble context
		const ctx = assembleContext({
			modeInstructions: "You are a code assistant",
			modeSlug: "code",
			autonomyLevel: "trusted",
			allowedTools: ["bash", "read", "write"],
			profileContext: profile.renderContext(),
			memoryContext: scenes2.map((s) => s.summary).join("\n"),
			ragContext: null,
			planContext: null,
		});
		expect(ctx).toContain("TypeScript, Express");
		expect(ctx).toContain("JWT tokens");
	});

	test("security: blocks sensitive file in hook", () => {
		const result = handlePreToolUse({
			tool: "read",
			params: { file_path: "/home/user/.ssh/id_rsa" },
			mode: "code",
			autonomy: "autonomous",
		});
		expect(result.decision).toBe("block");
	});

	test("vault: encrypt, store, retrieve", async () => {
		const vault = await Vault.init(dir);
		await vault.set("api_key", "sk-test123");
		const val = await vault.get("api_key");
		expect(val).toBe("sk-test123");
	});
});
