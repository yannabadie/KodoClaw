import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type MemCell, createMemCell, loadMemCells } from "../../src/memory/memcell";

describe("MemCell", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-cells-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("creates a memcell with required fields", async () => {
		const cell = await createMemCell(dir, {
			episode: "Refactored auth module",
			facts: ["Uses JWT", "Express backend"],
			tags: ["auth", "refactoring"],
		});
		expect(cell.id).toMatch(/^mc_/);
		expect(cell.episode).toBe("Refactored auth module");
		expect(cell.facts).toEqual(["Uses JWT", "Express backend"]);
		expect(cell.tags).toEqual(["auth", "refactoring"]);
		expect(cell.timestamp).toBeDefined();
	});

	test("creates a memcell with foresight", async () => {
		const cell = await createMemCell(dir, {
			episode: "Started OAuth2 work",
			facts: ["OAuth2 provider selected"],
			tags: ["auth"],
			foresight: { content: "Will add Google OAuth next", expires: "2026-03-10" },
		});
		expect(cell.foresight?.content).toBe("Will add Google OAuth next");
		expect(cell.foresight?.expires).toBe("2026-03-10");
	});

	test("persists to disk and loads back", async () => {
		await createMemCell(dir, { episode: "Test ep", facts: ["fact1"], tags: ["t1"] });
		await createMemCell(dir, { episode: "Test ep2", facts: ["fact2"], tags: ["t2"] });
		const cells = await loadMemCells(dir);
		expect(cells.length).toBe(2);
	});

	test("filters expired foresight on load", async () => {
		await createMemCell(dir, {
			episode: "Old task",
			facts: ["fact"],
			tags: ["t"],
			foresight: { content: "expired intent", expires: "2020-01-01" },
		});
		const cells = await loadMemCells(dir);
		expect(cells[0]?.foresight).toBeUndefined();
	});
});
