// test/planning/library.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MilestoneLibrary } from "../../src/planning/library";
import type { Plan } from "../../src/planning/planner";

describe("MilestoneLibrary", () => {
	let dir: string;
	let lib: MilestoneLibrary;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-lib-"));
		lib = new MilestoneLibrary(dir);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("archives a completed plan", async () => {
		const plan: Plan = {
			task: "Add OAuth2",
			milestones: [
				{ id: 1, goal: "Analyze auth", status: "completed" },
				{ id: 2, goal: "Implement flow", status: "completed" },
			],
			createdAt: new Date().toISOString(),
		};
		await lib.archive(plan);
		const all = await lib.list();
		expect(all.length).toBe(1);
		expect(all[0]?.task).toBe("Add OAuth2");
	});

	test("finds similar past plans", async () => {
		const plan: Plan = {
			task: "Add OAuth2 authentication",
			milestones: [{ id: 1, goal: "Setup OAuth provider", status: "completed" }],
			createdAt: new Date().toISOString(),
		};
		await lib.archive(plan);

		const similar = await lib.findSimilar("Add Google OAuth");
		expect(similar.length).toBeGreaterThan(0);
	});
});
