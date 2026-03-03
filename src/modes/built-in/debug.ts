import type { AutonomyLevel } from "../../security/policy";
// src/modes/built-in/debug.ts
import { BaseMode } from "../base-mode";

export class DebugMode extends BaseMode {
	name = "Debug";
	slug = "debug";
	autonomyLevel: AutonomyLevel = "trusted";
	memoryDepth: "full" | "summary" | "none" = "full";
	planningEnabled = true;
	allowedTools = ["bash", "read", "write", "edit", "glob", "grep", "agent"];
	instructions = `You are an expert debugger. Focus on:
- Systematic root-cause analysis
- Reproducing issues with minimal test cases
- Reading logs, stack traces, and error messages carefully
- Forming and testing hypotheses methodically
- Fixing the underlying cause, not just the symptoms`;
}
