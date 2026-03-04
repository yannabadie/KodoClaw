// test/planning/planner.test.ts
import { describe, expect, test } from "bun:test";
import {
	type Plan,
	addSubtask,
	completeSubtask,
	createPlan,
	getActiveMilestone,
	getUnblockedMilestones,
	isPlanComplete,
	replan,
	updateMilestone,
} from "../../src/planning/planner";

describe("Planner", () => {
	test("creates a plan with milestones", () => {
		const plan = createPlan("Add OAuth2", [
			"Analyze existing auth",
			"Install OAuth2 provider",
			"Implement auth flow",
			"Write tests",
		]);
		expect(plan.task).toBe("Add OAuth2");
		expect(plan.milestones.length).toBe(4);
		expect(plan.milestones[0]?.status).toBe("pending");
	});

	test("getActiveMilestone returns first pending", () => {
		const plan = createPlan("task", ["step1", "step2"]);
		const first = plan.milestones[0];
		expect(first).toBeDefined();
		(first as Plan["milestones"][number]).status = "completed";
		const active = getActiveMilestone(plan);
		expect(active?.goal).toBe("step2");
	});

	test("updateMilestone changes status", () => {
		const plan = createPlan("task", ["step1", "step2"]);
		updateMilestone(plan, 1, "completed");
		expect(plan.milestones[0]?.status).toBe("completed");
	});

	test("isPlanComplete returns true when all done", () => {
		const plan = createPlan("task", ["step1"]);
		expect(isPlanComplete(plan)).toBe(false);
		const m = plan.milestones[0];
		expect(m).toBeDefined();
		(m as Plan["milestones"][number]).status = "completed";
		expect(isPlanComplete(plan)).toBe(true);
	});

	test("milestone can have subtasks", () => {
		const plan = createPlan("task", ["step1", "step2"]);
		addSubtask(plan, 1, "sub-step A");
		addSubtask(plan, 1, "sub-step B");
		const m = plan.milestones[0];
		expect(m).toBeDefined();
		expect(m?.subtasks).toHaveLength(2);
		expect(m?.subtasks?.[0]?.label).toBe("sub-step A");
		expect(m?.subtasks?.[0]?.done).toBe(false);
	});

	test("completeSubtask marks subtask done", () => {
		const plan = createPlan("task", ["step1"]);
		addSubtask(plan, 1, "sub A");
		completeSubtask(plan, 1, 1);
		expect(plan.milestones[0]?.subtasks?.[0]?.done).toBe(true);
	});

	test("milestone supports blockedBy dependencies", () => {
		const plan = createPlan("task", ["step1", "step2", "step3"]);
		const m1 = plan.milestones[1];
		expect(m1).toBeDefined();
		(m1 as Plan["milestones"][number]).blockedBy = [1];
		const m2 = plan.milestones[2];
		expect(m2).toBeDefined();
		(m2 as Plan["milestones"][number]).blockedBy = [1, 2];
		const unblocked = getUnblockedMilestones(plan);
		expect(unblocked).toHaveLength(1);
		expect(unblocked[0]?.id).toBe(1);
	});

	test("getUnblockedMilestones updates when deps complete", () => {
		const plan = createPlan("task", ["step1", "step2", "step3"]);
		const m1 = plan.milestones[1];
		expect(m1).toBeDefined();
		(m1 as Plan["milestones"][number]).blockedBy = [1];
		const m2 = plan.milestones[2];
		expect(m2).toBeDefined();
		(m2 as Plan["milestones"][number]).blockedBy = [2];
		updateMilestone(plan, 1, "completed");
		const unblocked = getUnblockedMilestones(plan);
		expect(unblocked.map((m) => m.id)).toEqual([2]);
	});

	test("milestone supports priority", () => {
		const plan = createPlan("task", ["low", "high"]);
		const low = plan.milestones[0];
		expect(low).toBeDefined();
		(low as Plan["milestones"][number]).priority = 3;
		const high = plan.milestones[1];
		expect(high).toBeDefined();
		(high as Plan["milestones"][number]).priority = 1;
		const unblocked = getUnblockedMilestones(plan);
		expect(unblocked[0]?.goal).toBe("high");
	});

	test("replan adds new milestones", () => {
		const plan = createPlan("task", ["step1"]);
		replan(plan, { add: [{ goal: "step2", after: 1 }] });
		expect(plan.milestones).toHaveLength(2);
		expect(plan.milestones[1]?.goal).toBe("step2");
	});

	test("replan removes milestones", () => {
		const plan = createPlan("task", ["step1", "step2", "step3"]);
		replan(plan, { remove: [2] });
		expect(plan.milestones).toHaveLength(2);
		expect(plan.milestones.find((m) => m.id === 2)).toBeUndefined();
	});
});
