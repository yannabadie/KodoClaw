// test/planning/hints.test.ts
import { describe, expect, test } from "bun:test";
import { type StepHint, generateHint } from "../../src/planning/hints";
import type { Milestone } from "../../src/planning/planner";

describe("StepHint", () => {
	test("generates hint for active milestone", () => {
		const milestone: Milestone = { id: 2, goal: "Install OAuth2 provider", status: "in_progress" };
		const hint = generateHint(milestone, {
			lastAction: "Analyzed auth.ts — found JWT implementation",
			lastError: null,
		});
		expect(hint.stateContext).toContain("Analyzed auth.ts");
		expect(hint.milestoneGap).toContain("Install OAuth2 provider");
		expect(hint.actionCorrection).toBeNull();
	});

	test("includes action correction on error", () => {
		const milestone: Milestone = { id: 2, goal: "Install package", status: "in_progress" };
		const hint = generateHint(milestone, {
			lastAction: "Ran npm install passport-oauth2",
			lastError: "npm ERR! 404 Not Found",
		});
		expect(hint.actionCorrection).toContain("404 Not Found");
	});

	test("renders as context string", () => {
		const milestone: Milestone = { id: 1, goal: "Setup", status: "in_progress" };
		const hint = generateHint(milestone, { lastAction: "Started work", lastError: null });
		const rendered = hint.render();
		expect(rendered).toContain("State:");
		expect(rendered).toContain("Gap:");
	});

	test("includes subtask progress in hint", () => {
		const milestone: Milestone = {
			id: 1,
			goal: "Setup auth",
			status: "in_progress",
			subtasks: [
				{ id: 1, label: "Install deps", done: true },
				{ id: 2, label: "Configure OAuth", done: false },
				{ id: 3, label: "Write tests", done: false },
			],
		};
		const hint = generateHint(milestone, { lastAction: "Installed deps", lastError: null });
		const rendered = hint.render();
		expect(rendered).toContain("Subtasks: 1/3 done");
		expect(rendered).toContain("Next: Configure OAuth");
	});

	test("hint shows no subtask info when none exist", () => {
		const milestone: Milestone = { id: 1, goal: "Setup", status: "in_progress" };
		const hint = generateHint(milestone, { lastAction: "Started", lastError: null });
		const rendered = hint.render();
		expect(rendered).not.toContain("Subtasks:");
	});
});
