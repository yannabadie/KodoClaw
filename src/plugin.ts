import { isSensitivePath } from "./security/blocklist";
import {
	classifyShellRisk,
	shouldConfirm,
	type AutonomyLevel,
	type PolicyDecision,
} from "./security/policy";
import { scanForInjection } from "./security/injection";
import { sanitize } from "./context/sanitizer";

export interface HookInput {
	tool: string;
	params: Record<string, unknown>;
	mode: string;
	autonomy: AutonomyLevel;
}

export interface PreToolResult {
	decision: PolicyDecision;
	reason?: string;
}

export interface PostToolResult {
	injectionScore: number;
	sanitizedOutput: string;
}

export function handlePreToolUse(input: HookInput): PreToolResult {
	// Check sensitive file paths for read/write/edit tools
	if (["read", "write", "edit"].includes(input.tool)) {
		const filePath = (input.params.file_path ?? input.params.path ?? "") as string;
		if (isSensitivePath(filePath)) {
			return { decision: "block", reason: `Blocked: sensitive file path "${filePath}"` };
		}
	}

	// Classify shell commands
	if (input.tool === "bash") {
		const cmd = (input.params.command ?? "") as string;
		const risk = classifyShellRisk(cmd);
		const decision = shouldConfirm(input.autonomy, risk);
		if (decision !== "allow") {
			return { decision, reason: `Shell command "${cmd}" classified as ${risk} risk` };
		}
	}

	return { decision: "allow" };
}

export function handlePostToolUse(input: { output: string }): PostToolResult {
	const injection = scanForInjection(input.output);
	const sanitized = sanitize(input.output);
	return {
		injectionScore: injection.score,
		sanitizedOutput: sanitized.content,
	};
}
