import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SessionEndInput, handleSessionEnd } from "../../src/hooks/session-end";

describe("handleSessionEnd", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-session-end-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("writes audit record to sessions file", async () => {
		const input: SessionEndInput = {
			sessionId: "sess_end_001",
			reason: "clear",
		};

		const result = await handleSessionEnd(input, dir);
		expect(result.auditFlushed).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		expect(files.length).toBe(1);
		expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-sessions\.jsonl$/);

		const content = await readFile(join(auditDir, files[0] as string), "utf-8");
		const parsed = JSON.parse(content.trim()) as {
			ts: string;
			sessionId: string;
			reason: string;
			event: string;
		};
		expect(parsed.sessionId).toBe("sess_end_001");
		expect(parsed.reason).toBe("clear");
		expect(parsed.event).toBe("session_end");
		expect(parsed.ts).toBeDefined();
	});

	test("records correct reason for each exit type", async () => {
		const input: SessionEndInput = {
			sessionId: "sess_end_002",
			reason: "bypass_permissions_disabled",
		};

		const result = await handleSessionEnd(input, dir);
		expect(result.auditFlushed).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		const content = await readFile(join(auditDir, files[0] as string), "utf-8");
		const parsed = JSON.parse(content.trim()) as { reason: string };
		expect(parsed.reason).toBe("bypass_permissions_disabled");
	});
});
