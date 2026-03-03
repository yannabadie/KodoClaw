import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface StopInput {
	sessionId: string;
	reason: "user" | "timeout" | "error";
	stats: {
		toolCalls: number;
		duration_ms: number;
	};
}

export interface StopResult {
	persisted: boolean;
	auditFlushed: boolean;
}

export async function handleStop(input: StopInput, baseDir: string): Promise<StopResult> {
	const summary = {
		sessionId: input.sessionId,
		reason: input.reason,
		toolCalls: input.stats.toolCalls,
		duration_ms: input.stats.duration_ms,
		endedAt: new Date().toISOString(),
	};

	const auditDir = join(baseDir, "audit");
	const dateStr = new Date().toISOString().slice(0, 10);
	const summaryPath = join(auditDir, `${dateStr}-sessions.jsonl`);

	try {
		await mkdir(auditDir, { recursive: true });
		await appendFile(summaryPath, `${JSON.stringify(summary)}\n`, "utf-8");
		return { persisted: true, auditFlushed: true };
	} catch {
		return { persisted: false, auditFlushed: false };
	}
}
