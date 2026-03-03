/**
 * MemScene clustering via Jaccard tag similarity.
 *
 * Groups related MemCells into scenes based on tag overlap.
 * Uses Jaccard similarity with a threshold of 0.3.
 */

import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MemCell } from "./memcell";

export interface MemScene {
	id: string;
	title: string;
	cells: string[];
	tags: string[];
	summary: string;
	lastUpdated: string;
}

const JACCARD_THRESHOLD = 0.3;

/**
 * Compute Jaccard similarity between two sets of strings.
 * J(A, B) = |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(a: string[], b: string[]): number {
	const setA = new Set(a);
	const setB = new Set(b);

	if (setA.size === 0 && setB.size === 0) return 0;

	let intersection = 0;
	for (const item of setA) {
		if (setB.has(item)) intersection++;
	}

	const union = setA.size + setB.size - intersection;
	if (union === 0) return 0;

	return intersection / union;
}

/**
 * Generate a simple unique ID for a new scene.
 */
function generateSceneId(): string {
	return `scene_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Build a title from the scene's tag list.
 */
function buildTitle(tags: string[]): string {
	if (tags.length === 0) return "Untitled Scene";
	return tags.join(", ");
}

/**
 * Merge tags from a cell into a scene, returning the deduplicated union.
 */
function mergeTags(sceneTags: string[], cellTags: string[]): string[] {
	const set = new Set([...sceneTags, ...cellTags]);
	return [...set];
}

/**
 * Load all MemScene files from a directory.
 */
export async function loadMemScenes(dir: string): Promise<MemScene[]> {
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}

	const scenes: MemScene[] = [];
	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		try {
			const raw = await readFile(join(dir, entry), "utf-8");
			const scene: MemScene = JSON.parse(raw);
			scenes.push(scene);
		} catch {
			// Skip malformed files
		}
	}

	return scenes;
}

/**
 * Save a single MemScene to disk.
 */
async function saveScene(dir: string, scene: MemScene): Promise<void> {
	const filePath = join(dir, `${scene.id}.json`);
	await writeFile(filePath, JSON.stringify(scene, null, 2), "utf-8");
}

/**
 * Consolidate a MemCell into existing scenes or create a new one.
 *
 * Uses Jaccard similarity on tags with a threshold of 0.3.
 * If the cell's tags are similar enough to an existing scene,
 * the cell is assimilated into the best-matching scene.
 * Otherwise, a new scene is created.
 */
export async function consolidate(
	dir: string,
	cell: MemCell,
	existingScenes: MemScene[],
): Promise<void> {
	let bestScene: MemScene | null = null;
	let bestScore = 0;

	for (const scene of existingScenes) {
		const score = jaccardSimilarity(cell.tags, scene.tags);
		if (score >= JACCARD_THRESHOLD && score > bestScore) {
			bestScore = score;
			bestScene = scene;
		}
	}

	if (bestScene) {
		// Assimilate: add cell to the best matching scene
		if (!bestScene.cells.includes(cell.id)) {
			bestScene.cells.push(cell.id);
		}
		bestScene.tags = mergeTags(bestScene.tags, cell.tags);
		bestScene.title = buildTitle(bestScene.tags);
		bestScene.summary = [bestScene.summary, cell.facts.join("; ")].filter(Boolean).join("; ");
		bestScene.lastUpdated = new Date().toISOString();
		await saveScene(dir, bestScene);
	} else {
		// Create a new scene
		const scene: MemScene = {
			id: generateSceneId(),
			title: buildTitle(cell.tags),
			cells: [cell.id],
			tags: [...cell.tags],
			summary: cell.facts.join("; "),
			lastUpdated: new Date().toISOString(),
		};
		await saveScene(dir, scene);
	}
}
