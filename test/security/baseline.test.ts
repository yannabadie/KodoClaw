import { describe, expect, test } from "bun:test";
import { BehaviorBaseline, type BehaviorEvent } from "../../src/security/baseline";

function makeEvent(overrides: Partial<BehaviorEvent> = {}): BehaviorEvent {
	return {
		tool: "read_file",
		sensitive: false,
		riskLevel: "low",
		injectionScore: 0,
		timestamp: Date.now(),
		...overrides,
	};
}

describe("BehaviorBaseline", () => {
	test("starts with no anomalies", () => {
		const baseline = new BehaviorBaseline();
		const report = baseline.analyze();
		expect(report.isNormal).toBe(true);
		expect(report.anomalies).toEqual([]);
	});

	test("records events and reports normal behavior", () => {
		const baseline = new BehaviorBaseline();
		baseline.record(makeEvent({ tool: "read_file" }));
		baseline.record(makeEvent({ tool: "write_file" }));
		baseline.record(makeEvent({ tool: "shell" }));

		const report = baseline.analyze();
		expect(report.isNormal).toBe(true);
		expect(report.anomalies).toEqual([]);
		expect(baseline.recentCount).toBe(3);
	});

	test("detects tool frequency spike", () => {
		const baseline = new BehaviorBaseline();
		for (let i = 0; i < 51; i++) {
			baseline.record(makeEvent());
		}

		const report = baseline.analyze();
		expect(report.isNormal).toBe(false);
		const spike = report.anomalies.find((a) => a.type === "tool_frequency_spike");
		expect(spike).toBeDefined();
		expect(spike!.currentValue).toBe(51);
		expect(spike!.threshold).toBe(50);
	});

	test("detects sensitive access spike", () => {
		const baseline = new BehaviorBaseline();
		for (let i = 0; i < 6; i++) {
			baseline.record(makeEvent({ sensitive: true }));
		}

		const report = baseline.analyze();
		expect(report.isNormal).toBe(false);
		const spike = report.anomalies.find((a) => a.type === "sensitive_access_spike");
		expect(spike).toBeDefined();
		expect(spike!.currentValue).toBe(6);
		expect(spike!.threshold).toBe(5);
	});

	test("detects high risk command spike", () => {
		const baseline = new BehaviorBaseline();
		baseline.record(makeEvent({ riskLevel: "high" }));
		baseline.record(makeEvent({ riskLevel: "critical" }));
		baseline.record(makeEvent({ riskLevel: "high" }));
		baseline.record(makeEvent({ riskLevel: "critical" }));

		const report = baseline.analyze();
		expect(report.isNormal).toBe(false);
		const spike = report.anomalies.find((a) => a.type === "high_risk_spike");
		expect(spike).toBeDefined();
		expect(spike!.currentValue).toBe(4);
		expect(spike!.threshold).toBe(3);
	});

	test("detects injection spike", () => {
		const baseline = new BehaviorBaseline();
		baseline.record(makeEvent({ injectionScore: 1 }));
		baseline.record(makeEvent({ injectionScore: 2 }));
		baseline.record(makeEvent({ injectionScore: 3 }));

		const report = baseline.analyze();
		expect(report.isNormal).toBe(false);
		const spike = report.anomalies.find((a) => a.type === "injection_spike");
		expect(spike).toBeDefined();
		expect(spike!.currentValue).toBe(3);
		expect(spike!.threshold).toBe(2);
	});

	test("ignores events outside window", () => {
		const baseline = new BehaviorBaseline();
		const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

		// Record old events that would trigger all anomalies if they were recent
		for (let i = 0; i < 51; i++) {
			baseline.record(
				makeEvent({
					timestamp: tenMinutesAgo,
					sensitive: true,
					riskLevel: "high",
					injectionScore: 1,
				}),
			);
		}

		const report = baseline.analyze();
		expect(report.isNormal).toBe(true);
		expect(report.anomalies).toEqual([]);
		expect(baseline.recentCount).toBe(0);
	});

	test("reset clears all events", () => {
		const baseline = new BehaviorBaseline();
		for (let i = 0; i < 51; i++) {
			baseline.record(makeEvent({ sensitive: true, riskLevel: "high", injectionScore: 1 }));
		}

		const beforeReset = baseline.analyze();
		expect(beforeReset.isNormal).toBe(false);
		expect(beforeReset.anomalies.length).toBeGreaterThan(0);

		baseline.reset();

		const afterReset = baseline.analyze();
		expect(afterReset.isNormal).toBe(true);
		expect(afterReset.anomalies).toEqual([]);
		expect(baseline.recentCount).toBe(0);
	});
});
