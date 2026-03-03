import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface AuditEntry {
	session: string;
	mode: string;
	autonomy: string;
	action: string;
	command?: string;
	risk_level: string;
	decision: string;
	injection_score: number;
	latency_ms: number;
	token_cost: number;
}

interface AuditRecord extends AuditEntry {
	ts: string;
}

export const ANOMALY_THRESHOLDS = {
	tool_calls_per_minute: 30,
	failed_tool_calls: 5,
	injection_attempts: 1,
	sensitive_data_access: 3,
	cost_per_session_usd: 10,
} as const;

export class AuditLog {
	constructor(private readonly dir: string) {}

	async write(entry: AuditEntry): Promise<void> {
		await mkdir(this.dir, { recursive: true });
		const now = new Date();
		const dateStr = now.toISOString().slice(0, 10);
		const record: AuditRecord = { ts: now.toISOString(), ...entry };
		const filePath = join(this.dir, `${dateStr}.jsonl`);
		await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf-8");
	}

	async readToday(): Promise<AuditRecord[]> {
		const dateStr = new Date().toISOString().slice(0, 10);
		const filePath = join(this.dir, `${dateStr}.jsonl`);
		try {
			const content = await readFile(filePath, "utf-8");
			return content
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((l) => JSON.parse(l));
		} catch {
			return [];
		}
	}
}
