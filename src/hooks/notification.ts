import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type NotificationLevel = "info" | "warning" | "critical";

export interface NotificationInput {
	level: NotificationLevel;
	message: string;
	source: string;
	sessionId: string;
}

export interface NotificationResult {
	logged: boolean;
}

export async function handleNotification(
	input: NotificationInput,
	baseDir: string,
): Promise<NotificationResult> {
	const auditDir = join(baseDir, "audit");
	await mkdir(auditDir, { recursive: true });

	const dateStr = new Date().toISOString().slice(0, 10);
	const alertPath = join(auditDir, `${dateStr}-alerts.jsonl`);

	const record = {
		ts: new Date().toISOString(),
		level: input.level,
		message: input.message,
		source: input.source,
		sessionId: input.sessionId,
	};

	await appendFile(alertPath, `${JSON.stringify(record)}\n`, "utf-8");
	return { logged: true };
}
