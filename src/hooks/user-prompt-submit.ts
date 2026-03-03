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
