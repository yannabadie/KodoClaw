import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SessionStartInput, handleSessionStart } from "../../src/hooks/session-start";
import { computeChecksum } from "../../src/memory/memcell";

describe("handleSessionStart", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-session-start-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("loads user profile stable traits", async () => {
		const memDir = join(dir, "memory");
		await mkdir(memDir, { recursive: true });
		const profile = {
			stableTraits: {
				language: "TypeScript",
				editor: "VS Code",
			},
		};
		await writeFile(join(memDir, "profile.json"), JSON.stringify(profile), "utf-8");

		const input: SessionStartInput = {
			sessionId: "sess_start_001",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		expect(result.additionalContext).toContain("User profile:");
		expect(result.additionalContext).toContain("language: TypeScript");
		expect(result.additionalContext).toContain("editor: VS Code");
	});

	test("counts memory cells", async () => {
		const cellsDir = join(dir, "memory", "cells");
		await mkdir(cellsDir, { recursive: true });
		await writeFile(join(cellsDir, "cell-1.json"), "{}", "utf-8");
		await writeFile(join(cellsDir, "cell-2.json"), "{}", "utf-8");
		await writeFile(join(cellsDir, "cell-3.json"), "{}", "utf-8");

		const input: SessionStartInput = {
			sessionId: "sess_start_002",
			source: "resume",
		};

		const result = await handleSessionStart(input, dir);
		expect(result.additionalContext).toContain("Memory: 3 episodic cells available");
	});

	test("combines profile and memory info", async () => {
		const memDir = join(dir, "memory");
		const cellsDir = join(memDir, "cells");
		await mkdir(cellsDir, { recursive: true });

		const profile = { stableTraits: { role: "developer" } };
		await writeFile(join(memDir, "profile.json"), JSON.stringify(profile), "utf-8");
		await writeFile(join(cellsDir, "cell-1.json"), "{}", "utf-8");

		const input: SessionStartInput = {
			sessionId: "sess_start_003",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		expect(result.additionalContext).toContain("User profile: role: developer");
		expect(result.additionalContext).toContain("Memory: 1 episodic cells available");
		// Parts joined with ". "
		expect(result.additionalContext).toContain(". ");
	});

	test("returns only RAG context when no profile or cells exist", async () => {
		const input: SessionStartInput = {
			sessionId: "sess_start_004",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		// No profile or memory, but RAG status is always included
		expect(result.additionalContext).toContain("RAG");
		expect(result.additionalContext).not.toContain("User profile:");
		expect(result.additionalContext).not.toContain("Memory:");
	});

	test("ignores non-json files in cells directory", async () => {
		const cellsDir = join(dir, "memory", "cells");
		await mkdir(cellsDir, { recursive: true });
		await writeFile(join(cellsDir, "cell-1.json"), "{}", "utf-8");
		await writeFile(join(cellsDir, "readme.txt"), "not a cell", "utf-8");

		const input: SessionStartInput = {
			sessionId: "sess_start_005",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		expect(result.additionalContext).toContain("Memory: 1 episodic cells available");
	});

	test("handles profile with no stableTraits", async () => {
		const memDir = join(dir, "memory");
		await mkdir(memDir, { recursive: true });
		await writeFile(join(memDir, "profile.json"), JSON.stringify({}), "utf-8");

		const input: SessionStartInput = {
			sessionId: "sess_start_006",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		// No profile traits, but RAG status is always included
		expect(result.additionalContext).toContain("RAG");
		expect(result.additionalContext).not.toContain("User profile:");
	});

	test("includes real memory context when valid cells exist", async () => {
		const cellsDir = join(dir, "memory", "cells");
		await mkdir(cellsDir, { recursive: true });

		// Create a valid MemCell with proper structure and checksum
		const cell1 = {
			id: "mc_test000001",
			episode: "Fixed authentication bug in login flow",
			facts: ["auth token was expiring too early", "increased TTL to 24 hours"],
			tags: ["bugfix", "auth"],
			timestamp: new Date().toISOString(),
			importance: 1.0,
			checksum: "",
		};
		cell1.checksum = computeChecksum(cell1);
		await writeFile(join(cellsDir, "mc_test000001.json"), JSON.stringify(cell1), "utf-8");

		const cell2 = {
			id: "mc_test000002",
			episode: "Deployed new API endpoint for project management",
			facts: ["added REST endpoint for projects", "includes pagination support"],
			tags: ["feature", "api"],
			timestamp: new Date().toISOString(),
			importance: 1.0,
			checksum: "",
		};
		cell2.checksum = computeChecksum(cell2);
		await writeFile(join(cellsDir, "mc_test000002.json"), JSON.stringify(cell2), "utf-8");

		const input: SessionStartInput = {
			sessionId: "sess_start_007",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		expect(result.additionalContext).toContain("Memory Context:");
		// Should contain at least one recalled episode
		expect(
			result.additionalContext.includes("Fixed authentication bug") ||
				result.additionalContext.includes("Deployed new API endpoint"),
		).toBe(true);
		// Should NOT contain the old count format
		expect(result.additionalContext).not.toContain("episodic cells available");
	});

	test("falls back to count when valid cells exist but do not match query", async () => {
		const cellsDir = join(dir, "memory", "cells");
		await mkdir(cellsDir, { recursive: true });

		// Create invalid cells (just empty JSON) that pass readdir count but fail isMemCell
		await writeFile(join(cellsDir, "cell-1.json"), "{}", "utf-8");
		await writeFile(join(cellsDir, "cell-2.json"), "{}", "utf-8");

		const input: SessionStartInput = {
			sessionId: "sess_start_008",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		// buildMemoryContext returns "" because isMemCell rejects {},
		// so fallback counts the JSON files
		expect(result.additionalContext).toContain("Memory: 2 episodic cells available");
	});

	test("memory context includes score brackets", async () => {
		const cellsDir = join(dir, "memory", "cells");
		await mkdir(cellsDir, { recursive: true });

		const cell = {
			id: "mc_test000003",
			episode: "Refactored recent project context module",
			facts: ["simplified the context assembly pipeline"],
			tags: ["refactor", "context", "project"],
			timestamp: new Date().toISOString(),
			importance: 1.0,
			checksum: "",
		};
		cell.checksum = computeChecksum(cell);
		await writeFile(join(cellsDir, "mc_test000003.json"), JSON.stringify(cell), "utf-8");

		const input: SessionStartInput = {
			sessionId: "sess_start_009",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		expect(result.additionalContext).toContain("Memory Context:");
		// Score format is [X.XX]
		expect(result.additionalContext).toMatch(/\[\d+\.\d{2}\]/);
	});

	test("includes RAG status in context", async () => {
		const result = await handleSessionStart({ sessionId: "s1", source: "startup" }, dir);
		// Should mention RAG in some form
		expect(result.additionalContext).toContain("RAG");
	});

	test("combines profile with real memory context", async () => {
		const memDir = join(dir, "memory");
		const cellsDir = join(memDir, "cells");
		await mkdir(cellsDir, { recursive: true });

		const profile = { stableTraits: { language: "TypeScript" } };
		await writeFile(join(memDir, "profile.json"), JSON.stringify(profile), "utf-8");

		const cell = {
			id: "mc_test000004",
			episode: "Updated recent project TypeScript configuration",
			facts: ["enabled strict mode in tsconfig"],
			tags: ["config", "project"],
			timestamp: new Date().toISOString(),
			importance: 1.0,
			checksum: "",
		};
		cell.checksum = computeChecksum(cell);
		await writeFile(join(cellsDir, "mc_test000004.json"), JSON.stringify(cell), "utf-8");

		const input: SessionStartInput = {
			sessionId: "sess_start_010",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		expect(result.additionalContext).toContain("User profile: language: TypeScript");
		expect(result.additionalContext).toContain("Memory Context:");
		// Both parts joined with ". "
		expect(result.additionalContext).toContain(". ");
	});
});
