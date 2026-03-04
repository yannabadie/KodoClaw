export interface AgentTemplate {
	name: string;
	slug: string;
	description: string;
	tools: string[];
	disallowedTools?: string[];
	permissionMode?: "default" | "plan" | "bypassPermissions";
	skills?: string[];
	mcpServers?: string[];
	maxTurns?: number;
	instructions: string;
	autonomyLevel: string;
	memoryDepth: "full" | "summary" | "none";
	planningEnabled: boolean;
}

export function isValidTemplate(v: unknown): v is AgentTemplate {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.name === "string" &&
		typeof obj.slug === "string" &&
		typeof obj.description === "string" &&
		Array.isArray(obj.tools) &&
		typeof obj.instructions === "string" &&
		typeof obj.autonomyLevel === "string" &&
		typeof obj.memoryDepth === "string" &&
		typeof obj.planningEnabled === "boolean"
	);
}

export const BUILT_IN_TEMPLATES: AgentTemplate[] = [
	{
		name: "Code",
		slug: "code",
		description: "Default coding agent with trusted autonomy and full tools",
		tools: ["bash", "read", "write", "edit", "glob", "grep", "agent"],
		instructions:
			"You are the default Kodo coding agent. Write clean, secure TypeScript following project conventions. Use Kodo's memory system to recall past context. Create milestone plans for non-trivial tasks.",
		autonomyLevel: "trusted",
		memoryDepth: "summary",
		planningEnabled: true,
	},
	{
		name: "Architect",
		slug: "architect",
		description: "System design agent with supervised autonomy and read-only tools",
		tools: ["read", "glob", "grep", "agent"],
		instructions:
			"You are Kodo's system design agent. Analyze codebase architecture and propose designs. Review module boundaries, dependencies, and data flows. Present options with trade-offs.",
		autonomyLevel: "supervised",
		memoryDepth: "full",
		planningEnabled: true,
	},
	{
		name: "Debug",
		slug: "debug",
		description: "Debugging agent with trusted autonomy and systematic approach",
		tools: ["bash", "read", "write", "edit", "glob", "grep", "agent"],
		instructions:
			"You are Kodo's debugging agent. Follow a systematic approach: reproduce, isolate, diagnose, fix, verify. Check audit logs for recent errors. Run tests after fixes.",
		autonomyLevel: "trusted",
		memoryDepth: "full",
		planningEnabled: true,
	},
	{
		name: "Review",
		slug: "review",
		description: "Code review agent with guarded autonomy focused on security and quality",
		tools: ["read", "glob", "grep"],
		instructions:
			"You are Kodo's code review agent. Review code for correctness, security vulnerabilities, and quality. Check OWASP compliance. Verify conventions and test coverage.",
		autonomyLevel: "guarded",
		memoryDepth: "summary",
		planningEnabled: false,
	},
	{
		name: "Security Audit",
		slug: "security-audit",
		description: "Security audit agent with supervised autonomy for OWASP checks",
		tools: ["read", "glob", "grep"],
		instructions:
			"You are Kodo's security audit agent. Audit against OWASP Agentic Top 10 and LLM Top 10. Verify injection scanner coverage, sensitive path blocklist, shell risk classification, output guard patterns, vault integrity, and memory integrity.",
		autonomyLevel: "supervised",
		memoryDepth: "summary",
		planningEnabled: false,
	},
];
