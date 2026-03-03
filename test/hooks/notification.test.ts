import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type NotificationInput, handleNotification } from "../../src/hooks/notification";

describe("handleNotification", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-notify-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("logs critical notification to alerts file", async () => {
		const input: NotificationInput = {
			level: "critical",
			message: "Injection attempt detected",
			source: "security/injection-guard",
			sessionId: "sess_001",
		};

		const result = await handleNotification(input, dir);
		expect(result.logged).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		expect(files.length).toBe(1);
		expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-alerts\.jsonl$/);

		const content = await readFile(join(auditDir, files[0]!), "utf-8");
		const parsed = JSON.parse(content.trim()) as {
			level: string;
			message: string;
			source: string;
			sessionId: string;
			ts: string;
		};
		expect(parsed.level).toBe("critical");
		expect(parsed.message).toBe("Injection attempt detected");
		expect(parsed.source).toBe("security/injection-guard");
		expect(parsed.sessionId).toBe("sess_001");
		expect(parsed.ts).toBeDefined();
	});

	test("logs warning notification", async () => {
		const input: NotificationInput = {
			level: "warning",
			message: "High tool call rate",
			source: "security/anomaly-detector",
			sessionId: "sess_002",
		};

		const result = await handleNotification(input, dir);
		expect(result.logged).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		const content = await readFile(join(auditDir, files[0]!), "utf-8");
		const parsed = JSON.parse(content.trim()) as { level: string };
		expect(parsed.level).toBe("warning");
	});

	test("creates audit directory if missing", async () => {
		const input: NotificationInput = {
			level: "info",
			message: "Session started",
			source: "hooks/lifecycle",
			sessionId: "sess_003",
		};

		const result = await handleNotification(input, dir);
		expect(result.logged).toBe(true);

		const auditDir = join(dir, "audit");
		const files = await readdir(auditDir);
		expect(files.length).toBe(1);
	});
});
