// src/cli/commands.ts
export interface KodoCommand {
	command: string;
	args: string[];
}

const VALID_COMMANDS = new Set([
	"status",
	"plan",
	"audit",
	"memory",
	"cost",
	"mode",
	"autonomy",
	"stop",
	"undo",
	"health",
	"ui",
]);

export function parseCommand(input: string): KodoCommand | null {
	const trimmed = input.trim();
	if (!trimmed.startsWith("/kodo ") && trimmed !== "/kodo") return null;

	const parts = trimmed.slice("/kodo".length).trim().split(/\s+/);
	const command = parts[0];
	if (!command || !VALID_COMMANDS.has(command)) return null;

	return { command, args: parts.slice(1) };
}
