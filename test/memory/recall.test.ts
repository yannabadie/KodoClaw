import { describe, expect, test } from "bun:test";
import { reciprocalRankFusion, cosineSimilarity } from "../../src/memory/recall";

describe("cosineSimilarity", () => {
	test("identical vectors return 1", () => {
		expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1.0);
	});
	test("orthogonal vectors return 0", () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
	});
	test("empty vectors return 0", () => {
		expect(cosineSimilarity([], [])).toBe(0);
	});
});

describe("reciprocalRankFusion", () => {
	test("fuses two ranked lists", () => {
		const listA = [{ id: "a", score: 3 }, { id: "b", score: 2 }, { id: "c", score: 1 }];
		const listB = [{ id: "b", score: 3 }, { id: "c", score: 2 }, { id: "a", score: 1 }];
		const fused = reciprocalRankFusion([listA, listB]);
		expect(fused.length).toBe(3);
		expect(fused.map((r) => r.id)).toContain("a");
		expect(fused.map((r) => r.id)).toContain("b");
	});

	test("handles single list", () => {
		const list = [{ id: "x", score: 1 }];
		const fused = reciprocalRankFusion([list]);
		expect(fused.length).toBe(1);
		expect(fused[0]!.id).toBe("x");
	});
});
