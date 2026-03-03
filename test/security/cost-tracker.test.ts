import { describe, expect, test } from "bun:test";
import { CostTracker } from "../../src/security/cost-tracker";

describe("CostTracker", () => {
	test("starts with zero cost", () => {
		const tracker = new CostTracker();
		const snap = tracker.snapshot;
		expect(snap.totalInputTokens).toBe(0);
		expect(snap.totalOutputTokens).toBe(0);
		expect(snap.estimatedCostUsd).toBe(0);
		expect(snap.budgetExceeded).toBe(false);
		expect(tracker.isOverBudget).toBe(false);
	});

	test("records token usage", () => {
		const tracker = new CostTracker();
		tracker.record({ inputTokens: 500, outputTokens: 200 });
		const snap = tracker.snapshot;
		expect(snap.totalInputTokens).toBe(500);
		expect(snap.totalOutputTokens).toBe(200);
	});

	test("estimates cost correctly", () => {
		const tracker = new CostTracker();
		// 1M input tokens @ $3/M = $3.00
		tracker.record({ inputTokens: 1_000_000, outputTokens: 0 });
		expect(tracker.snapshot.estimatedCostUsd).toBe(3);

		// Reset and test output pricing
		tracker.reset();
		// 1M output tokens @ $15/M = $15.00
		tracker.record({ inputTokens: 0, outputTokens: 1_000_000 });
		expect(tracker.snapshot.estimatedCostUsd).toBe(15);
	});

	test("tracks budget remaining", () => {
		const tracker = new CostTracker(10);
		// $3 input cost -> $7 remaining
		tracker.record({ inputTokens: 1_000_000, outputTokens: 0 });
		const snap = tracker.snapshot;
		expect(snap.budgetRemainingUsd).toBe(7);
		expect(snap.budgetExceeded).toBe(false);
	});

	test("detects budget exceeded", () => {
		const tracker = new CostTracker(10);
		// 1M output tokens @ $15/M = $15 -> exceeds $10 budget
		tracker.record({ inputTokens: 0, outputTokens: 1_000_000 });
		expect(tracker.isOverBudget).toBe(true);
		expect(tracker.snapshot.budgetExceeded).toBe(true);
		expect(tracker.snapshot.budgetRemainingUsd).toBe(0);
	});

	test("resets tracker", () => {
		const tracker = new CostTracker();
		tracker.record({ inputTokens: 100_000, outputTokens: 50_000 });
		expect(tracker.snapshot.totalInputTokens).toBe(100_000);

		tracker.reset();
		const snap = tracker.snapshot;
		expect(snap.totalInputTokens).toBe(0);
		expect(snap.totalOutputTokens).toBe(0);
		expect(snap.estimatedCostUsd).toBe(0);
		expect(tracker.isOverBudget).toBe(false);
	});

	test("handles custom budget", () => {
		const tracker = new CostTracker(5);
		// 1M input tokens @ $3/M = $3 -> under $5 budget
		tracker.record({ inputTokens: 1_000_000, outputTokens: 0 });
		expect(tracker.isOverBudget).toBe(false);
		expect(tracker.snapshot.budgetRemainingUsd).toBe(2);

		// Add 200k output tokens @ $15/M = $3 -> total $6 -> exceeds $5 budget
		tracker.record({ inputTokens: 0, outputTokens: 200_000 });
		expect(tracker.isOverBudget).toBe(true);
		expect(tracker.snapshot.budgetExceeded).toBe(true);
	});

	test("accumulates across multiple records", () => {
		const tracker = new CostTracker();
		tracker.record({ inputTokens: 100, outputTokens: 50 });
		tracker.record({ inputTokens: 200, outputTokens: 75 });
		tracker.record({ inputTokens: 300, outputTokens: 125 });

		const snap = tracker.snapshot;
		expect(snap.totalInputTokens).toBe(600);
		expect(snap.totalOutputTokens).toBe(250);
	});
});
