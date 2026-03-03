#!/usr/bin/env bun
/**
 * Hook CLI wrapper — reads JSON from stdin, dispatches to handler, writes JSON to stdout.
 * Usage: echo '{"tool":"read","params":{}}' | bun run src/hooks/cli.ts PreToolUse
 */
import { handlePostToolUse, handlePreToolUse } from "../plugin";
import { handleNotification } from "./notification";
import { handleStop } from "./stop";

type HookType = "PreToolUse" | "PostToolUse" | "Stop" | "Notification";

function isValidHookType(value: string): value is HookType {
	return (
		value === "PreToolUse" ||
		value === "PostToolUse" ||
		value === "Stop" ||
		value === "Notification"
	);
}

async function readStdin(): Promise<string> {
	let input = "";
	for await (const chunk of Bun.stdin.stream()) {
		input += new TextDecoder().decode(chunk);
	}
	return input;
}

async function main(): Promise<void> {
	const hookType = process.argv[2];
	if (!hookType) {
		process.stderr.write(
			"Usage: bun run src/hooks/cli.ts <PreToolUse|PostToolUse|Stop|Notification>\n",
		);
		process.exit(1);
	}

	if (!isValidHookType(hookType)) {
		process.stderr.write(`Unknown hook type: ${hookType}\n`);
		process.exit(1);
	}

	const raw = await readStdin();
	const payload: unknown = JSON.parse(raw);
	const baseDir = process.cwd();

	let result: unknown;
	switch (hookType) {
		case "PreToolUse":
			result = handlePreToolUse(payload as Parameters<typeof handlePreToolUse>[0]);
			break;
		case "PostToolUse":
			result = handlePostToolUse(payload as Parameters<typeof handlePostToolUse>[0]);
			break;
		case "Stop":
			result = await handleStop(
				payload as Parameters<typeof handleStop>[0],
				baseDir,
			);
			break;
		case "Notification":
			result = await handleNotification(
				payload as Parameters<typeof handleNotification>[0],
				baseDir,
			);
			break;
	}

	process.stdout.write(JSON.stringify(result));
}

main().catch((err: Error) => {
	process.stderr.write(`Hook error: ${err.message}\n`);
	process.exit(1);
});
