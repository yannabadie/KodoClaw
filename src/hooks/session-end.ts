import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface SessionEndInput {
	sessionId: string;
	reason: "clear" | "logout" | "prompt_input_exit" | "bypass_permissions_disabled" | "other";
}

export interface SessionEndResult {
	auditFlushed: boolean;
}

export async function handleSessionEnd(
	input: SessionEndInput,
	baseDir: string,
): Promise<SessionEndResult> {
	const auditDir = join(baseDir, "audit");
	await mkdir(auditDir, { recursive: true });

	const dateStr = new Date().toISOString().slice(0, 10);
	const path = join(auditDir, `${dateStr}-sessions.jsonl`);

	const record = {
		ts: new Date().toISOString(),
		sessionId: input.sessionId,
		reason: input.reason,
		event: "session_end",
	};

	await appendFile(path, `${JSON.stringify(record)}\n`, "utf-8");
	return { auditFlushed: true };
}
