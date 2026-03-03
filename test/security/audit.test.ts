import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ANOMALY_THRESHOLDS, type AuditEntry, AuditLog } from "../../src/security/audit";

describe("AuditLog", () => {
	let dir: string;
	let log: AuditLog;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-audit-"));
		log = new AuditLog(dir);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("writes entry as JSONL line", async () => {
		await log.write({
			session: "sess_1",
			mode: "code",
			autonomy: "trusted",
			action: "shell_exec",
			command: "ls",
			risk_level: "low",
			decision: "auto_approved",
			injection_score: 0,
			latency_ms: 50,
			token_cost: 0.001,
		});
		const files = await readdir(dir);
		expect(files.length).toBe(1);
		expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/);
		const content = await readFile(join(dir, files[0]!), "utf-8");
		const parsed = JSON.parse(content.trim());
		expect(parsed.session).toBe("sess_1");
		expect(parsed.ts).toBeDefined();
	});

	test("appends multiple entries to same file", async () => {
		await log.write({
			session: "s1",
			mode: "code",
			autonomy: "trusted",
			action: "a1",
			risk_level: "low",
			decision: "auto_approved",
			injection_score: 0,
			latency_ms: 10,
			token_cost: 0,
		});
		await log.write({
			session: "s1",
			mode: "code",
			autonomy: "trusted",
			action: "a2",
			risk_level: "low",
			decision: "auto_approved",
			injection_score: 0,
			latency_ms: 10,
			token_cost: 0,
		});
		const files = await readdir(dir);
		expect(files.length).toBe(1);
		const lines = (await readFile(join(dir, files[0]!), "utf-8")).trim().split("\n");
		expect(lines.length).toBe(2);
	});

	test("anomaly thresholds are defined", () => {
		expect(ANOMALY_THRESHOLDS.tool_calls_per_minute).toBe(30);
		expect(ANOMALY_THRESHOLDS.failed_tool_calls).toBe(5);
		expect(ANOMALY_THRESHOLDS.injection_attempts).toBe(1);
		expect(ANOMALY_THRESHOLDS.cost_per_session_usd).toBe(10);
	});
});
