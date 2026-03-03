import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface PostToolUseFailureInput {
	toolName: string;
	error: string;
	sessionId: string;
}

export interface PostToolUseFailureResult {
	logged: boolean;
}

export async function handlePostToolUseFailure(
	input: PostToolUseFailureInput,
	baseDir: string,
): Promise<PostToolUseFailureResult> {
	// Log failure to audit
	const auditDir = join(baseDir, "audit");
	await mkdir(auditDir, { recursive: true });
	const date = new Date().toISOString().slice(0, 10);
	const filePath = join(auditDir, `${date}-failures.jsonl`);
	const record = {
		timestamp: new Date().toISOString(),
		tool: input.toolName,
		error: input.error,
		sessionId: input.sessionId,
	};
	await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf-8");
	return { logged: true };
}
