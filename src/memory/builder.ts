/**
 * Memory context builder — wires BM25 search, decay scoring, and memcell
 * loading into a single pipeline that returns ranked memory context.
 */

import { BM25Index } from "./bm25";
import { loadMemCells } from "./memcell";
import { applyDecayToScores } from "./recall";

/**
 * Build a ranked memory context string from persisted MemCells.
 *
 * Pipeline:
 * 1. Load all validated cells from `cellsDir`
 * 2. Build a BM25 index over episode + facts text
 * 3. Search with the user query
 * 4. Apply importance-weighted decay to BM25 scores
 * 5. Format as markdown bullet list with scores
 *
 * @param cellsDir — directory containing MemCell JSON files
 * @param query — user query to search against
 * @param topK — maximum number of results (default 5)
 * @returns formatted context string, or empty string if no cells/matches
 */
export async function buildMemoryContext(
	cellsDir: string,
	query: string,
	topK = 5,
): Promise<string> {
	// 1. Load all validated cells
	const cells = await loadMemCells(cellsDir);
	if (cells.length === 0) return "";

	// 2. Build BM25 index, add each cell's searchable text
	const index = new BM25Index();
	for (const cell of cells) {
		const text = `${cell.episode} ${cell.facts.join(" ")}`;
		index.add(cell.id, text);
	}

	// 3. Search with query
	const results = index.search(query, topK);
	if (results.length === 0) return "";

	// 4. Build timestamps map for decay (Map with string timestamps)
	const cellTimestamps = new Map<string, { timestamp: string; importance?: number }>();
	for (const cell of cells) {
		cellTimestamps.set(cell.id, {
			timestamp: cell.timestamp,
			importance: cell.importance ?? 1.0,
		});
	}

	// 5. Apply decay-weighted scores
	const decayed = applyDecayToScores(results, cellTimestamps);

	// 6. Format as markdown
	const lines = decayed.map(
		(r) => `- [${r.score.toFixed(2)}] ${cells.find((c) => c.id === r.id)?.episode ?? r.id}`,
	);
	return lines.join("\n");
}
