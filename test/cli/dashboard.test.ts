// test/cli/dashboard.test.ts
import { describe, expect, test } from "bun:test";
import { renderDashboard, type DashboardData } from "../../src/cli/dashboard";

describe("renderDashboard", () => {
  test("renders mode and autonomy", () => {
    const data: DashboardData = {
      mode: "code",
      autonomy: "trusted",
      memoryCount: 47,
      planProgress: { done: 3, total: 5 },
      sessionCost: 0.0,
      dailyCost: 1.23,
    };
    const output = renderDashboard(data);
    expect(output).toContain("code");
    expect(output).toContain("trusted");
    expect(output).toContain("47");
    expect(output).toContain("3/5");
  });

  test("omits plan when no active plan", () => {
    const data: DashboardData = {
      mode: "ask",
      autonomy: "guarded",
      memoryCount: 0,
      planProgress: null,
      sessionCost: 0,
      dailyCost: 0,
    };
    const output = renderDashboard(data);
    expect(output).not.toContain("/");
    expect(output).toContain("ask");
  });
});
