#!/usr/bin/env bun
/**
 * Hook CLI wrapper — reads JSON from stdin, dispatches to handler, writes JSON to stdout.
 * Usage: echo '{"tool":"read","params":{}}' | bun run src/hooks/cli.ts PreToolUse
 */
import { handlePostToolUse, handlePreToolUse } from "../plugin";
import { handleNotification } from "./notification";
import { handlePostToolUseFailure } from "./post-tool-failure";
import { handlePreCompact } from "./precompact";
import { handleSessionEnd } from "./session-end";
import { handleSessionStart } from "./session-start";
import { handleStop } from "./stop";
import { handleUserPromptSubmit, persistLastPrompt } from "./user-prompt-submit";

type HookType =
	| "PreToolUse"
	| "PostToolUse"
	| "PostToolUseFailure"
	| "Stop"
	| "Notification"
	| "PreCompact"
	| "SessionStart"
	| "UserPromptSubmit"
	| "SessionEnd";

function validatePreToolInput(v: unknown): v is Parameters<typeof handlePreToolUse>[0] {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	// Accept official field names (tool_name, tool_input) or legacy (tool, params)
	const tool = (obj.tool_name ?? obj.tool) as string | undefined;
	const params = (obj.tool_input ?? obj.params) as Record<string, unknown> | undefined;
	const mode = (obj.mode ?? "code") as string;
	const autonomy = (obj.autonomy ?? "trusted") as string;
	if (typeof tool !== "string") return false;
	if (typeof params !== "object" || params === null) return false;
	// Normalize to internal format
	(obj as Record<string, unknown>).tool = tool;
	(obj as Record<string, unknown>).params = params;
	(obj as Record<string, unknown>).mode = mode;
	(obj as Record<string, unknown>).autonomy = autonomy;
	return true;
}

function validatePostToolInput(v: unknown): v is Parameters<typeof handlePostToolUse>[0] {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	const output = (obj.tool_output ?? obj.output) as string | undefined;
	if (typeof output !== "string") return false;
	// Normalize to internal format
	(obj as Record<string, unknown>).output = output;
	return true;
}

function validateStopInput(v: unknown): boolean {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	if (typeof obj.sessionId !== "string" && typeof obj.session_id !== "string") return false;
	if (typeof obj.reason !== "string") return false;
	const stats = obj.stats as Record<string, unknown> | undefined;
	if (typeof stats !== "object" || stats === null) return false;
	if (typeof stats.toolCalls !== "number" && typeof stats.tool_calls !== "number") return false;
	if (typeof stats.duration_ms !== "number") return false;
	return true;
}

function validateNotificationInput(v: unknown): boolean {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	if (typeof obj.level !== "string") return false;
	if (typeof obj.message !== "string") return false;
	if (typeof obj.source !== "string") return false;
	if (typeof obj.sessionId !== "string" && typeof obj.session_id !== "string") return false;
	return true;
}

function validatePreCompactInput(v: unknown): boolean {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	if (typeof obj.trigger !== "string") return false;
	if (typeof obj.sessionId !== "string" && typeof obj.session_id !== "string") return false;
	if (typeof obj.contextTokens !== "number" && typeof obj.context_tokens !== "number") return false;
	return true;
}

function validateSessionEndInput(v: unknown): boolean {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	if (typeof obj.sessionId !== "string" && typeof obj.session_id !== "string") return false;
	if (typeof obj.reason !== "string") return false;
	return true;
}

function normalizePayload(payload: Record<string, unknown>): Record<string, unknown> {
	const normalized = { ...payload };
	// Map official spec snake_case to internal camelCase
	if (normalized.session_id && !normalized.sessionId) {
		normalized.sessionId = normalized.session_id;
	}
	if (normalized.context_tokens !== undefined && normalized.contextTokens === undefined) {
		normalized.contextTokens = normalized.context_tokens;
	}
	// Normalize nested stats for Stop payloads
	if (typeof normalized.stats === "object" && normalized.stats !== null) {
		const stats = { ...(normalized.stats as Record<string, unknown>) };
		if (stats.tool_calls !== undefined && stats.toolCalls === undefined) {
			stats.toolCalls = stats.tool_calls;
		}
		normalized.stats = stats;
	}
	return normalized;
}

function isValidHookType(value: string): value is HookType {
	return (
		value === "PreToolUse" ||
		value === "PostToolUse" ||
		value === "PostToolUseFailure" ||
		value === "Stop" ||
		value === "Notification" ||
		value === "PreCompact" ||
		value === "SessionStart" ||
		value === "UserPromptSubmit" ||
		value === "SessionEnd"
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
			"Usage: bun run src/hooks/cli.ts <PreToolUse|PostToolUse|PostToolUseFailure|Stop|Notification|PreCompact|SessionStart|UserPromptSubmit|SessionEnd>\n",
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
		case "PreToolUse": {
			if (!validatePreToolInput(payload)) {
				process.stderr.write("Invalid PreToolUse payload\n");
				process.exit(2);
			}
			const preResult = handlePreToolUse(payload);
			// Support kill switch — if decision blocks with kill switch reason, halt Claude entirely
			if (preResult.decision === "block" && preResult.reason?.includes("kill switch")) {
				result = { continue: false, stopReason: preResult.reason };
			} else {
				const hookOutput: Record<string, unknown> = {
					hookEventName: "PreToolUse",
					permissionDecision:
						preResult.decision === "block"
							? "deny"
							: preResult.decision === "confirm"
								? "ask"
								: "allow",
					permissionDecisionReason: preResult.reason ?? "",
				};
				// Support updatedInput for tool parameter modification (Claude Code spec)
				if (preResult.updatedInput) {
					hookOutput.updatedInput = preResult.updatedInput;
				}
				result = {
					hookSpecificOutput: hookOutput,
					// Support systemMessage for explaining decisions to Claude
					...(preResult.systemMessage ? { systemMessage: preResult.systemMessage } : {}),
				};
			}
			break;
		}
		case "PostToolUse":
			if (!validatePostToolInput(payload)) {
				process.stderr.write("Invalid PostToolUse payload\n");
				process.exit(2);
			}
			{
				const postResult = handlePostToolUse(payload);
				// Use official PostToolUse format: top-level decision + hookSpecificOutput for context
				const outputThreatsMsg =
					postResult.outputThreats.length > 0
						? ` Output threats: ${postResult.outputThreats.join(", ")}.`
						: "";

				if (postResult.injectionScore >= 4) {
					result = {
						decision: "block",
						reason: `Injection detected in tool output (score: ${postResult.injectionScore})`,
						...(outputThreatsMsg
							? { systemMessage: `Security scan blocked output.${outputThreatsMsg}` }
							: {}),
					};
				} else if (postResult.injectionScore >= 1 || postResult.outputThreats.length > 0) {
					result = {
						hookSpecificOutput: {
							hookEventName: "PostToolUse",
							additionalContext: `Warning: potential injection in output (score: ${postResult.injectionScore}).${outputThreatsMsg}`,
						},
						...(outputThreatsMsg
							? { systemMessage: `Output guard flagged threats.${outputThreatsMsg}` }
							: {}),
					};
				} else {
					result = {};
				}
			}
			break;
		case "Stop":
			if (!validateStopInput(payload)) {
				process.stderr.write("Invalid Stop payload\n");
				process.exit(2);
			}
			result = await handleStop(
				normalizePayload(payload as Record<string, unknown>) as Parameters<typeof handleStop>[0],
				baseDir,
			);
			break;
		case "Notification":
			if (!validateNotificationInput(payload)) {
				process.stderr.write("Invalid Notification payload\n");
				process.exit(2);
			}
			result = await handleNotification(
				normalizePayload(payload as Record<string, unknown>) as Parameters<
					typeof handleNotification
				>[0],
				baseDir,
			);
			break;
		case "PreCompact":
			if (!validatePreCompactInput(payload)) {
				process.stderr.write("Invalid PreCompact payload\n");
				process.exit(2);
			}
			result = await handlePreCompact(
				normalizePayload(payload as Record<string, unknown>) as Parameters<
					typeof handlePreCompact
				>[0],
				baseDir,
			);
			break;
		case "SessionStart": {
			const startInput = payload as Record<string, unknown>;
			const startResult = await handleSessionStart(
				{
					sessionId: (startInput.session_id ?? startInput.sessionId ?? "") as string,
					source: (startInput.source ?? "startup") as string,
					model: startInput.model as string | undefined,
				},
				baseDir,
			);
			// SessionStart output uses hookSpecificOutput with additionalContext
			if (startResult.additionalContext) {
				result = {
					hookSpecificOutput: {
						hookEventName: "SessionStart",
						additionalContext: startResult.additionalContext,
					},
				};
			} else {
				result = {};
			}
			break;
		}
		case "UserPromptSubmit": {
			const promptInput = payload as Record<string, unknown>;
			const prompt = (promptInput.prompt ?? "") as string;
			// Persist prompt for task-driven recall (before injection check)
			try {
				await persistLastPrompt(prompt, baseDir);
			} catch {
				// Non-critical — don't block on persistence failure
			}
			result = handleUserPromptSubmit({
				prompt,
				sessionId: (promptInput.session_id ?? "") as string,
			});
			break;
		}
		case "PostToolUseFailure": {
			const failInput = payload as Record<string, unknown>;
			result = await handlePostToolUseFailure(
				{
					toolName: (failInput.tool_name ?? "") as string,
					error: (failInput.error ?? "") as string,
					sessionId: (failInput.session_id ?? "") as string,
				},
				baseDir,
			);
			break;
		}
		case "SessionEnd":
			if (!validateSessionEndInput(payload)) {
				process.stderr.write("Invalid SessionEnd payload\n");
				process.exit(2);
			}
			result = await handleSessionEnd(
				normalizePayload(payload as Record<string, unknown>) as Parameters<
					typeof handleSessionEnd
				>[0],
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
