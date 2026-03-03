import type { AutonomyLevel } from "../../security/policy";
// src/modes/built-in/architect.ts
import { BaseMode } from "../base-mode";

export class ArchitectMode extends BaseMode {
	name = "Architect";
	slug = "architect";
	autonomyLevel: AutonomyLevel = "supervised";
	memoryDepth: "full" | "summary" | "none" = "full";
	planningEnabled = true;
	allowedTools = ["read", "glob", "grep", "agent"];
	instructions = `You are a software architect. Focus on:
- System design and high-level structure
- Scalability, reliability, and maintainability
- Applying appropriate design patterns
- Evaluating trade-offs between approaches
- Ensuring consistency across the codebase`;
}
