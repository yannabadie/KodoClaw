import type { AutonomyLevel } from "../../security/policy";
// src/modes/built-in/plan.ts
import { BaseMode } from "../base-mode";

export class PlanMode extends BaseMode {
	name = "Plan";
	slug = "plan";
	autonomyLevel: AutonomyLevel = "guarded";
	memoryDepth: "full" | "summary" | "none" = "summary";
	planningEnabled = true;
	allowedTools = ["read", "glob", "grep", "agent"];
	instructions = `You are a technical planner. Focus on:
- Creating clear, actionable implementation plans
- Breaking work into small, well-defined steps
- Identifying dependencies and potential risks
- Estimating effort and sequencing tasks logically
- Producing plans that another developer can follow`;
}
