// test/planning/planner.test.ts
import { describe, expect, test } from "bun:test";
import {
  createPlan,
  updateMilestone,
  getActiveMilestone,
  isPlanComplete,
  type Plan,
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
    expect(plan.milestones[0]!.status).toBe("pending");
  });

  test("getActiveMilestone returns first pending", () => {
    const plan = createPlan("task", ["step1", "step2"]);
    plan.milestones[0]!.status = "completed";
    const active = getActiveMilestone(plan);
    expect(active?.goal).toBe("step2");
  });

  test("updateMilestone changes status", () => {
    const plan = createPlan("task", ["step1", "step2"]);
    updateMilestone(plan, 1, "completed");
    expect(plan.milestones[0]!.status).toBe("completed");
  });

  test("isPlanComplete returns true when all done", () => {
    const plan = createPlan("task", ["step1"]);
    expect(isPlanComplete(plan)).toBe(false);
    plan.milestones[0]!.status = "completed";
    expect(isPlanComplete(plan)).toBe(true);
  });
});
