import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scanForInjection } from "../security/injection";

export interface UserPromptSubmitInput {
	prompt: string;
	sessionId: string;
}

export interface UserPromptSubmitResult {
	decision?: "block";
	reason?: string;
	additionalContext?: string;
}

export function handleUserPromptSubmit(input: UserPromptSubmitInput): UserPromptSubmitResult {
	// Scan user prompt for injection patterns
	const injection = scanForInjection(input.prompt);

	if (injection.action === "block") {
		return {
			decision: "block",
			reason: `Prompt blocked: injection detected (score: ${injection.score})`,
		};
	}

	if (injection.action === "sanitize" || injection.action === "flag") {
		return {
			additionalContext: `Warning: user prompt has injection indicators (score: ${injection.score})`,
		};
	}

	return {};
}

/**
 * Persist the user's prompt for task-driven memory recall.
 * Called from cli.ts before injection scanning.
 * Truncates to 500 chars to avoid excessive disk usage.
 */
export async function persistLastPrompt(prompt: string, baseDir: string): Promise<void> {
	const memDir = join(baseDir, "memory");
	await mkdir(memDir, { recursive: true });
	const truncated = prompt.slice(0, 500);
	await writeFile(join(memDir, "last-prompt.txt"), truncated, "utf-8");
}
