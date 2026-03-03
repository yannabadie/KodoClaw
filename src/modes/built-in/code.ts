import type { AutonomyLevel } from "../../security/policy";
// src/modes/built-in/code.ts
import { BaseMode } from "../base-mode";

export class CodeMode extends BaseMode {
	name = "Code";
	slug = "code";
	autonomyLevel: AutonomyLevel = "trusted";
	memoryDepth: "full" | "summary" | "none" = "summary";
	planningEnabled = true;
	allowedTools = ["bash", "read", "write", "edit", "glob", "grep", "agent"];
	instructions = `You are a senior software engineer. Focus on:
- Writing clean, tested, production-ready code
- Following existing project conventions
- Small, focused changes with clear intent
- TDD when appropriate
- DRY and YAGNI principles`;
}

export { ArchitectMode } from "./architect";
export { AskMode } from "./ask";
export { DebugMode } from "./debug";
export { PlanMode } from "./plan";
export { ReviewMode } from "./review";
