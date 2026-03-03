#!/usr/bin/env bun
/**
 * Hook CLI wrapper — reads JSON from stdin, dispatches to handler, writes JSON to stdout.
 * Usage: echo '{"tool":"read","params":{}}' | bun run src/hooks/cli.ts PreToolUse
 */
import { handlePostToolUse, handlePreToolUse } from "../plugin";
import { handleNotification } from "./notification";
import { handleStop } from "./stop";

type HookType = "PreToolUse" | "PostToolUse" | "Stop" | "Notification";

function validatePreToolInput(v: unknown): v is Parameters<typeof handlePreToolUse>[0] {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.tool === "string" &&
		typeof obj.mode === "string" &&
		typeof obj.autonomy === "string" &&
		typeof obj.params === "object" &&
		obj.params !== null
	);
}

function validatePostToolInput(v: unknown): v is Parameters<typeof handlePostToolUse>[0] {
	if (typeof v !== "object" || v === null) return false;
	return typeof (v as Record<string, unknown>).output === "string";
}

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
			if (!validatePreToolInput(payload)) {
				process.stderr.write("Invalid PreToolUse payload\n");
				process.exit(2);
			}
			result = handlePreToolUse(payload);
			break;
		case "PostToolUse":
			if (!validatePostToolInput(payload)) {
				process.stderr.write("Invalid PostToolUse payload\n");
				process.exit(2);
			}
			result = handlePostToolUse(payload);
			break;
		case "Stop":
			result = await handleStop(payload as Parameters<typeof handleStop>[0], baseDir);
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
