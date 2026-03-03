import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PreCompactInput {
	trigger: "manual" | "auto";
	sessionId: string;
	contextTokens: number;
}

export interface PreCompactResult {
	memoryPersisted: boolean;
}

export async function handlePreCompact(
	input: PreCompactInput,
	baseDir: string,
): Promise<PreCompactResult> {
	// Write a memory checkpoint before context is compacted
	const checkpointDir = join(baseDir, "memory");
	await mkdir(checkpointDir, { recursive: true });

	const checkpoint = {
		sessionId: input.sessionId,
		trigger: input.trigger,
		contextTokens: input.contextTokens,
		compactedAt: new Date().toISOString(),
	};

	const path = join(checkpointDir, `compact-${Date.now()}.json`);
	await writeFile(path, JSON.stringify(checkpoint, null, 2), "utf-8");
	return { memoryPersisted: true };
}
