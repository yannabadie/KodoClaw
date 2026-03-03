import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface SessionStartInput {
	sessionId: string;
	source: string; // "startup" | "resume" | "clear" | "compact"
	model?: string;
}

export interface SessionStartResult {
	additionalContext: string;
}

export async function handleSessionStart(
	input: SessionStartInput,
	baseDir: string,
): Promise<SessionStartResult> {
	const parts: string[] = [];

	// Load user profile summary if available
	const profilePath = join(baseDir, "memory", "profile.json");
	try {
		const raw = await readFile(profilePath, "utf-8");
		const profile = JSON.parse(raw) as { stableTraits?: Record<string, string> };
		if (profile.stableTraits) {
			const traits = Object.entries(profile.stableTraits)
				.map(([k, v]) => `${k}: ${v}`)
				.join(", ");
			if (traits) parts.push(`User profile: ${traits}`);
		}
	} catch {
		// No profile yet
	}

	// Count memory cells
	const cellsDir = join(baseDir, "memory", "cells");
	try {
		const files = await readdir(cellsDir);
		const count = files.filter((f) => f.endsWith(".json")).length;
		if (count > 0) parts.push(`Memory: ${count} episodic cells available`);
	} catch {
		// No cells yet
	}

	return {
		additionalContext: parts.length > 0 ? parts.join(". ") : "",
	};
}
