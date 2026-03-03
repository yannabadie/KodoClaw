import { sanitize } from "./context/sanitizer";
import { isSensitivePath } from "./security/blocklist";
import { scanForInjection } from "./security/injection";
import { guardOutput } from "./security/output-guard";
import {
	type AutonomyLevel,
	type PolicyDecision,
	classifyShellRisk,
	shouldConfirm,
} from "./security/policy";

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
	outputThreats: string[];
}

export function extractPaths(tool: string, params: Record<string, unknown>): string[] {
	const paths: string[] = [];

	if (["read", "write", "edit"].includes(tool)) {
		const filePath = (params.file_path ?? params.path ?? "") as string;
		if (filePath) paths.push(filePath);
	}

	if (tool === "glob") {
		const pattern = (params.pattern ?? "") as string;
		if (pattern) {
			// Extract directory portion before first glob wildcard
			const firstWild = pattern.search(/[*?{[]/);
			if (firstWild > 0) {
				paths.push(pattern.substring(0, firstWild));
			} else if (firstWild === -1) {
				// No wildcard — treat the whole pattern as a path
				paths.push(pattern);
			}
		}
		const dir = (params.path ?? "") as string;
		if (dir) paths.push(dir);
	}

	if (tool === "grep") {
		const searchPath = (params.path ?? "") as string;
		if (searchPath) paths.push(searchPath);
		const glob = (params.glob ?? "") as string;
		if (glob) {
			const firstWild = glob.search(/[*?{[]/);
			if (firstWild > 0) {
				paths.push(glob.substring(0, firstWild));
			} else if (firstWild === -1) {
				paths.push(glob);
			}
		}
	}

	return paths;
}

export function handlePreToolUse(input: HookInput): PreToolResult {
	// Check sensitive file paths for read/write/edit/glob/grep tools
	const paths = extractPaths(input.tool, input.params);
	for (const filePath of paths) {
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
	const guard = guardOutput(input.output);
	return {
		injectionScore: injection.score,
		sanitizedOutput: sanitized.content,
		outputThreats: guard.threats,
	};
}
