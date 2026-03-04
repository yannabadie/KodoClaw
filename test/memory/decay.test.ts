import { describe, expect, test } from "bun:test";
import { applyDecay, computeRetention, pruneDecayed } from "../../src/memory/decay";

describe("computeRetention", () => {
	test("returns 1.0 for current timestamp", () => {
		const now = Date.now();
		expect(computeRetention(now, now)).toBeCloseTo(1.0);
	});

	test("decays over time", () => {
		const now = Date.now();
		const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
		const retention = computeRetention(oneWeekAgo, now);
		expect(retention).toBeLessThan(1.0);
		expect(retention).toBeGreaterThan(0.0);
	});

	test("high importance decays slower", () => {
		const now = Date.now();
		const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
		const lowImportance = computeRetention(twoWeeksAgo, now, 0.5);
		const highImportance = computeRetention(twoWeeksAgo, now, 2.0);
		expect(highImportance).toBeGreaterThan(lowImportance);
	});

	test("returns 1.0 for future timestamps", () => {
		const now = Date.now();
		expect(computeRetention(now + 1000, now)).toBe(1.0);
	});

	test("returns 1.0 for infinite importance (never expire)", () => {
		const now = Date.now();
		const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
		expect(computeRetention(oneYearAgo, now, Number.POSITIVE_INFINITY)).toBe(1.0);
	});
});

describe("pruneDecayed", () => {
	test("removes old low-importance items", () => {
		const now = Date.now();
		const items = [
			{ timestamp: new Date(now).toISOString(), importance: 1.0 }, // current
			{
				timestamp: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(),
				importance: 0.1,
			}, // 90 days, low importance
		];
		const remaining = pruneDecayed(items, now);
		expect(remaining.length).toBe(1);
	});

	test("keeps recent items", () => {
		const now = Date.now();
		const items = [{ timestamp: new Date(now - 1000).toISOString(), importance: 1.0 }];
		const remaining = pruneDecayed(items, now);
		expect(remaining.length).toBe(1);
	});
});

describe("applyDecay", () => {
	test("sorts by retention score", () => {
		const now = Date.now();
		const items = [
			{
				timestamp: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
				importance: 0.5,
			},
			{ timestamp: new Date(now - 1000).toISOString(), importance: 1.0 },
		];
		const sorted = applyDecay(items, now);
		expect(sorted[0]?.retention).toBeGreaterThan(sorted[1]?.retention ?? 0);
	});
});
