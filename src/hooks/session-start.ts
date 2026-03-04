import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildMemoryContext } from "../memory/builder";
import { getRAGSetupStatus, loadRAGConfig } from "../rag/config";

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

	// Recall ranked memory context via BM25 + decay pipeline
	const cellsDir = join(baseDir, "memory", "cells");

	// Determine recall query: use last prompt if available, fallback to generic
	let recallQuery = "recent project context";
	try {
		const lastPromptPath = join(baseDir, "memory", "last-prompt.txt");
		const lastPrompt = await readFile(lastPromptPath, "utf-8");
		if (lastPrompt.trim()) {
			recallQuery = lastPrompt.trim();
		}
	} catch {
		// No last-prompt.txt — use default query
	}

	let memoryContext = "";
	try {
		memoryContext = await buildMemoryContext(cellsDir, recallQuery);
	} catch {
		// buildMemoryContext failed — fall through to count fallback
	}

	if (memoryContext) {
		parts.push(`Memory Context:\n${memoryContext}`);
	} else {
		// Fall back to cell count when recall returns nothing
		try {
			const files = await readdir(cellsDir);
			const count = files.filter((f) => f.endsWith(".json")).length;
			if (count > 0) parts.push(`Memory: ${count} episodic cells available`);
		} catch {
			// No cells directory yet
		}
	}

	// Check RAG setup status
	try {
		const ragConfig = loadRAGConfig();
		const ragStatus = getRAGSetupStatus(ragConfig);

		if (ragStatus.geminiConfigured) {
			parts.push(`RAG: Gemini fallback active (${ragStatus.geminiApiKey})`);
		} else {
			parts.push("RAG: No Gemini API key. Add GOOGLE_API_KEY to .env for reliable RAG fallback");
		}
	} catch {
		// RAG config loading failed — not critical
	}

	return {
		additionalContext: parts.length > 0 ? parts.join(". ") : "",
	};
}
