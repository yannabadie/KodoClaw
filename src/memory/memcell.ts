/**
 * MemCell — episodic memory unit for Kodo.
 *
 * Each MemCell captures an episode (what happened), facts (extracted knowledge),
 * tags (for retrieval), and an optional foresight (future intent with expiration).
 *
 * MemCells are persisted as individual JSON files in a directory.
 */

import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface Foresight {
	/** Description of anticipated future action or intent. */
	content: string;
	/** ISO date string (YYYY-MM-DD) after which this foresight is no longer relevant. */
	expires: string;
}

export interface MemCell {
	/** Unique identifier, prefixed with "mc_". */
	id: string;
	/** Human-readable description of the episode. */
	episode: string;
	/** Extracted factual statements from the episode. */
	facts: string[];
	/** Tags for retrieval and categorisation. */
	tags: string[];
	/** ISO timestamp of when the cell was created. */
	timestamp: string;
	/** Optional forward-looking intent with an expiration date. */
	foresight?: Foresight;
}

export interface CreateMemCellInput {
	episode: string;
	facts: string[];
	tags: string[];
	foresight?: Foresight;
}

/**
 * Create a new MemCell, persist it as a JSON file in `dir`, and return it.
 */
export async function createMemCell(dir: string, input: CreateMemCellInput): Promise<MemCell> {
	const id = `mc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
	const cell: MemCell = {
		id,
		episode: input.episode,
		facts: input.facts,
		tags: input.tags,
		timestamp: new Date().toISOString(),
	};

	if (input.foresight) {
		cell.foresight = {
			content: input.foresight.content,
			expires: input.foresight.expires,
		};
	}

	const filePath = join(dir, `${id}.json`);
	await writeFile(filePath, JSON.stringify(cell, null, 2), "utf-8");

	return cell;
}

/**
 * Load all MemCells from a directory.
 *
 * Expired foresight entries (where `expires` is in the past) are stripped
 * from the returned cells. The on-disk files are not modified.
 */
export async function loadMemCells(dir: string): Promise<MemCell[]> {
	const entries = await readdir(dir);
	const jsonFiles = entries.filter((f) => f.endsWith(".json"));
	const now = new Date();

	const cells: MemCell[] = [];

	for (const file of jsonFiles) {
		const raw = await readFile(join(dir, file), "utf-8");
		const cell: MemCell = JSON.parse(raw);

		// Strip expired foresight
		if (cell.foresight) {
			const expiresDate = new Date(cell.foresight.expires);
			if (expiresDate < now) {
				cell.foresight = undefined;
			}
		}

		cells.push(cell);
	}

	return cells;
}
