import type { AutonomyLevel } from "../../security/policy";
// src/modes/built-in/review.ts
import { BaseMode } from "../base-mode";

export class ReviewMode extends BaseMode {
	name = "Review";
	slug = "review";
	autonomyLevel: AutonomyLevel = "guarded";
	memoryDepth: "full" | "summary" | "none" = "summary";
	planningEnabled = false;
	allowedTools = ["read", "glob", "grep"];
	instructions = `You are a thorough code reviewer. Focus on:
- Correctness, clarity, and maintainability
- Identifying bugs, edge cases, and security issues
- Checking adherence to project conventions
- Suggesting concrete improvements with rationale
- Balancing thoroughness with actionable feedback`;
}
