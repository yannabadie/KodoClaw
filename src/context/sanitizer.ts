import { isConfidentialContent, redactConfidential } from "../security/blocklist";
// src/context/sanitizer.ts
import { scanForInjection } from "../security/injection";

export interface SanitizeResult {
	content: string;
	injectionScore: number;
	redacted: boolean;
	blocked: boolean;
}

interface SanitizeOptions {
	addDelimiters?: boolean;
}

export function sanitize(input: string, opts: SanitizeOptions = {}): SanitizeResult {
	const injection = scanForInjection(input);
	let content = input;
	let redacted = false;

	if (injection.action === "block") {
		return {
			content: "[BLOCKED: injection detected]",
			injectionScore: injection.score,
			redacted: false,
			blocked: true,
		};
	}

	if (isConfidentialContent(content)) {
		content = redactConfidential(content);
		redacted = true;
	}

	if (opts.addDelimiters) {
		content = `<!-- USER DATA -->\n${content}`;
	}

	return { content, injectionScore: injection.score, redacted, blocked: false };
}
