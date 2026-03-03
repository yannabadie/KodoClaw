// src/context/assembler.ts
import type { AutonomyLevel } from "../security/policy";

export interface AssemblerInput {
	modeInstructions: string;
	modeSlug: string;
	autonomyLevel: AutonomyLevel;
	allowedTools: string[];
	profileContext: string;
	memoryContext: string;
	ragContext: string | null;
	planContext: string | null;
}

const TOKEN_BUDGET = 3000;
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = TOKEN_BUDGET * CHARS_PER_TOKEN;

function truncate(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars) + "\n[...truncated]";
}

export function assembleContext(input: AssemblerInput): string {
	const sections: string[] = [];
	let budget = MAX_CHARS;

	// Instructions section (priority: always included)
	sections.push("<!-- INSTRUCTIONS -->");
	sections.push("## Role");
	const instr = truncate(input.modeInstructions, 1500);
	sections.push(instr);
	budget -= instr.length;

	// Profile (priority: always included, ~200 tokens)
	if (input.profileContext) {
		sections.push("\n## User Profile");
		const prof = truncate(input.profileContext, 800);
		sections.push(prof);
		budget -= prof.length;
	}

	// Memory (priority: high, ~1500 tokens)
	if (input.memoryContext) {
		sections.push("\n## Memory context");
		const mem = truncate(input.memoryContext, Math.min(budget * 0.5, 6000));
		sections.push(mem);
		budget -= mem.length;
	}

	// RAG (priority: medium, ~500 tokens)
	if (input.ragContext) {
		sections.push("\n## RAG context (from NotebookLM)");
		const rag = truncate(input.ragContext, Math.min(budget * 0.4, 2000));
		sections.push(rag);
		budget -= rag.length;
	}

	// Plan (priority: medium, ~500 tokens)
	if (input.planContext) {
		sections.push("\n## Active plan");
		const plan = truncate(input.planContext, Math.min(budget * 0.5, 2000));
		sections.push(plan);
		budget -= plan.length;
	}

	// Constraints (priority: always)
	sections.push("\n## Constraints");
	sections.push(`Autonomy: ${input.autonomyLevel}`);
	sections.push(`Allowed tools: ${input.allowedTools.join(", ")}`);

	sections.push("\n<!-- USER DATA -->");

	return sections.join("\n");
}
