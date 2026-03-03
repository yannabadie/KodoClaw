import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SessionStartInput, handleSessionStart } from "../../src/hooks/session-start";

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

	test("returns empty context when no profile or cells exist", async () => {
		const input: SessionStartInput = {
			sessionId: "sess_start_004",
			source: "startup",
		};

		const result = await handleSessionStart(input, dir);
		expect(result.additionalContext).toBe("");
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
		expect(result.additionalContext).toBe("");
	});
});
