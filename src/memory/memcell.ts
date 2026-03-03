/**
 * MemCell — episodic memory unit for Kodo.
 *
 * Each MemCell captures an episode (what happened), facts (extracted knowledge),
 * tags (for retrieval), and an optional foresight (future intent with expiration).
 *
 * MemCells are persisted as individual JSON files in a directory.
 */

import { createHash, randomUUID } from "node:crypto";
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
	/** SHA-256 checksum of canonical content for integrity verification. */
	checksum: string;
}

export interface CreateMemCellInput {
	episode: string;
	facts: string[];
	tags: string[];
	foresight?: Foresight;
}

/**
 * Compute a SHA-256 checksum of the canonical content of a MemCell.
 *
 * The canonical form sorts `facts` and `tags` to ensure deterministic hashing
 * regardless of insertion order.
 */
export function computeChecksum(cell: { episode: string; facts: string[]; tags: string[] }): string {
	const canonical = JSON.stringify({
		episode: cell.episode,
		facts: [...cell.facts].sort(),
		tags: [...cell.tags].sort(),
	});
	return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Verify that a MemCell's checksum matches its current content.
 *
 * Returns `true` if the cell has not been tampered with.
 */
export function verifyChecksum(cell: MemCell): boolean {
	return cell.checksum === computeChecksum(cell);
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
		checksum: "", // placeholder — computed below
	};

	if (input.foresight) {
		cell.foresight = {
			content: input.foresight.content,
			expires: input.foresight.expires,
		};
	}

	cell.checksum = computeChecksum(cell);

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

		// Integrity check — verify checksum before trusting cell content
		if (!cell.checksum) {
			// Legacy cell without checksum — backfill it
			cell.checksum = computeChecksum(cell);
		} else if (!verifyChecksum(cell)) {
			// Tampered cell — skip it entirely
			console.error(`[kodo] MemCell ${cell.id} checksum mismatch — possible tampering`);
			continue;
		}

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
