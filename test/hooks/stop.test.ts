import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type StopInput, handleStop } from "../../src/hooks/stop";

describe("handleStop", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-stop-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("writes session summary to audit log", async () => {
		const input: StopInput = {
			sessionId: "sess_abc",
			reason: "user",
			stats: { toolCalls: 12, duration_ms: 30000 },
		};

		const result = await handleStop(input, dir);
		expect(result.persisted).toBe(true);
		expect(result.auditFlushed).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		expect(files.length).toBe(1);
		expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-sessions\.jsonl$/);

		const content = await readFile(join(auditDir, files[0] as string), "utf-8");
		const parsed = JSON.parse(content.trim()) as {
			sessionId: string;
			toolCalls: number;
			duration_ms: number;
			endedAt: string;
		};
		expect(parsed.sessionId).toBe("sess_abc");
		expect(parsed.toolCalls).toBe(12);
		expect(parsed.duration_ms).toBe(30000);
		expect(parsed.endedAt).toBeDefined();
	});

	test("handles missing audit directory", async () => {
		const input: StopInput = {
			sessionId: "sess_new",
			reason: "timeout",
			stats: { toolCalls: 5, duration_ms: 60000 },
		};

		const result = await handleStop(input, dir);
		expect(result.persisted).toBe(true);
		expect(result.auditFlushed).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		expect(files.length).toBe(1);
	});

	test("records correct reason", async () => {
		const input: StopInput = {
			sessionId: "sess_err",
			reason: "error",
			stats: { toolCalls: 3, duration_ms: 5000 },
		};

		const result = await handleStop(input, dir);
		expect(result.persisted).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		const content = await readFile(join(auditDir, files[0] as string), "utf-8");
		const parsed = JSON.parse(content.trim()) as { reason: string };
		expect(parsed.reason).toBe("error");
	});
});
