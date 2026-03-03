import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type PostToolUseFailureInput,
	handlePostToolUseFailure,
} from "../../src/hooks/post-tool-failure";

describe("handlePostToolUseFailure", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-post-tool-failure-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("logs failure to audit directory", async () => {
		const input: PostToolUseFailureInput = {
			toolName: "read",
			error: "File not found: /tmp/missing.ts",
			sessionId: "sess_fail_001",
		};

		const result = await handlePostToolUseFailure(input, dir);
		expect(result.logged).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		expect(files.length).toBe(1);
		expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-failures\.jsonl$/);

		const content = await readFile(join(auditDir, files[0] as string), "utf-8");
		const parsed = JSON.parse(content.trim()) as {
			timestamp: string;
			tool: string;
			error: string;
			sessionId: string;
		};
		expect(parsed.tool).toBe("read");
		expect(parsed.error).toBe("File not found: /tmp/missing.ts");
		expect(parsed.sessionId).toBe("sess_fail_001");
		expect(parsed.timestamp).toBeDefined();
	});

	test("creates audit directory if missing", async () => {
		const input: PostToolUseFailureInput = {
			toolName: "write",
			error: "Permission denied",
			sessionId: "sess_fail_002",
		};

		const result = await handlePostToolUseFailure(input, dir);
		expect(result.logged).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		expect(files.length).toBe(1);
	});

	test("appends multiple failures to same file", async () => {
		const input1: PostToolUseFailureInput = {
			toolName: "bash",
			error: "Command failed: exit code 1",
			sessionId: "sess_fail_003",
		};
		const input2: PostToolUseFailureInput = {
			toolName: "edit",
			error: "File locked",
			sessionId: "sess_fail_003",
		};

		await handlePostToolUseFailure(input1, dir);
		await handlePostToolUseFailure(input2, dir);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		expect(files.length).toBe(1);

		const content = await readFile(join(auditDir, files[0] as string), "utf-8");
		const lines = content.trim().split("\n");
		expect(lines.length).toBe(2);

		const first = JSON.parse(lines[0]) as { tool: string };
		const second = JSON.parse(lines[1]) as { tool: string };
		expect(first.tool).toBe("bash");
		expect(second.tool).toBe("edit");
	});
});
