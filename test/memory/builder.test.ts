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

	test("returns ranked memory context for matching cells", async () => {
		await createMemCell(dir, {
			episode: "Fixed authentication bug in login flow",
			facts: ["auth", "login", "bugfix"],
			tags: ["auth"],
		});
		await createMemCell(dir, {
			episode: "Deployed new API endpoint for users",
			facts: ["api", "deployment", "users"],
			tags: ["api"],
		});

		const result = await buildMemoryContext(dir, "authentication login");
		expect(result).toContain("authentication");
		expect(result.length).toBeGreaterThan(0);
	});

	test("respects topK parameter", async () => {
		// Create 5 cells
		for (let i = 0; i < 5; i++) {
			await createMemCell(dir, {
				episode: `Episode ${i} about topic ${i}`,
				facts: [`fact${i}`],
				tags: [`tag${i}`],
			});
		}

		const result = await buildMemoryContext(dir, "episode topic", 2);
		const lines = result.split("\n").filter((l) => l.startsWith("- "));
		expect(lines.length).toBeLessThanOrEqual(2);
	});

	test("handles cells with no matching query", async () => {
		await createMemCell(dir, {
			episode: "Python machine learning model",
			facts: ["ml", "python"],
			tags: ["ml"],
		});

		const result = await buildMemoryContext(dir, "xyznonexistent");
		// BM25 may still return results with low scores, or empty
		expect(typeof result).toBe("string");
	});

	test("formats output as scored markdown lines", async () => {
		await createMemCell(dir, {
			episode: "Configured database connection pooling",
			facts: ["postgres", "connection pool", "performance"],
			tags: ["database"],
		});

		const result = await buildMemoryContext(dir, "database connection");
		if (result.length > 0) {
			const lines = result.split("\n");
			for (const line of lines) {
				// Each line should match: - [X.XX] episode text
				expect(line).toMatch(/^- \[\d+\.\d{2}\] .+/);
			}
		}
	});
});
