import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PreCompactInput, handlePreCompact } from "../../src/hooks/precompact";

describe("handlePreCompact", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-precompact-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("writes checkpoint file to memory directory", async () => {
		const input: PreCompactInput = {
			trigger: "auto",
			sessionId: "sess_compact_001",
			contextTokens: 120000,
		};

		const result = await handlePreCompact(input, dir);
		expect(result.memoryPersisted).toBe(true);

		const memoryDir = join(dir, "memory");
		const files = await readdir(memoryDir);
		expect(files.length).toBe(1);
		expect(files[0]).toMatch(/^compact-\d+\.json$/);

		const content = await readFile(join(memoryDir, files[0] as string), "utf-8");
		const parsed = JSON.parse(content) as {
			sessionId: string;
			trigger: string;
			contextTokens: number;
			compactedAt: string;
		};
		expect(parsed.sessionId).toBe("sess_compact_001");
		expect(parsed.trigger).toBe("auto");
		expect(parsed.contextTokens).toBe(120000);
		expect(parsed.compactedAt).toBeDefined();
	});

	test("creates memory directory if missing", async () => {
		const input: PreCompactInput = {
			trigger: "manual",
			sessionId: "sess_compact_002",
			contextTokens: 80000,
		};

		const result = await handlePreCompact(input, dir);
		expect(result.memoryPersisted).toBe(true);

		const memoryDir = join(dir, "memory");
		const files = await readdir(memoryDir);
		expect(files.length).toBe(1);
	});
});
