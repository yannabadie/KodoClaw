// test/cli/alerts.test.ts
import { describe, expect, test } from "bun:test";
import { type SessionMetrics, checkAnomalies } from "../../src/cli/alerts";

describe("checkAnomalies", () => {
	test("no alerts for normal metrics", () => {
		const m: SessionMetrics = {
			toolCallsLastMinute: 5,
			consecutiveFailures: 0,
			injectionAttempts: 0,
			sessionCostUsd: 0.5,
		};
		expect(checkAnomalies(m)).toEqual([]);
	});

	test("alerts on high tool call rate", () => {
		const m: SessionMetrics = {
			toolCallsLastMinute: 31,
			consecutiveFailures: 0,
			injectionAttempts: 0,
			sessionCostUsd: 0,
		};
		const alerts = checkAnomalies(m);
		expect(alerts.length).toBe(1);
		expect(alerts[0]).toContain("tool calls/min");
	});

	test("alerts on injection attempts", () => {
		const m: SessionMetrics = {
			toolCallsLastMinute: 0,
			consecutiveFailures: 0,
			injectionAttempts: 1,
			sessionCostUsd: 0,
		};
		expect(checkAnomalies(m).length).toBe(1);
	});

	test("alerts on high cost", () => {
		const m: SessionMetrics = {
			toolCallsLastMinute: 0,
			consecutiveFailures: 0,
			injectionAttempts: 0,
			sessionCostUsd: 11,
		};
		expect(checkAnomalies(m).length).toBe(1);
	});

	test("multiple alerts stack", () => {
		const m: SessionMetrics = {
			toolCallsLastMinute: 35,
			consecutiveFailures: 6,
			injectionAttempts: 2,
			sessionCostUsd: 15,
		};
		expect(checkAnomalies(m).length).toBeGreaterThanOrEqual(3);
	});
});
