// src/rag/cache.ts
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BM25Index } from "../memory/bm25";

interface CacheEntry {
	query: string;
	answer: string;
	mode: string;
	cachedAt: number; // epoch ms
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SIMILARITY_THRESHOLD = 0.5;

function entryId(query: string, mode: string): string {
	return createHash("sha256").update(`${mode}:${query}`).digest("hex").slice(0, 16);
}

export class RAGCache {
	private entries: Map<string, CacheEntry> = new Map();
	private index: BM25Index = new BM25Index();
	private filePath: string;

	private constructor(filePath: string) {
		this.filePath = filePath;
	}

	static async load(dir: string): Promise<RAGCache> {
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "queries.json");
		const cache = new RAGCache(filePath);
		try {
			const raw = await readFile(filePath, "utf-8");
			const parsed: CacheEntry[] = JSON.parse(raw);
			for (const entry of parsed) {
				const id = entryId(entry.query, entry.mode);
				cache.entries.set(id, entry);
			}
			cache.rebuildIndex();
			cache.purgeExpired();
		} catch {
			// No cache yet
		}
		return cache;
	}

	async put(query: string, answer: string, mode: string): Promise<void> {
		const entry: CacheEntry = { query, answer, mode, cachedAt: Date.now() };
		const id = entryId(query, mode);
		this.entries.set(id, entry);
		this.index.add(id, `${mode} ${query}`);
		await this.save();
	}

	async get(query: string, mode: string): Promise<string | null> {
		// Exact match first (O(1) via hash key)
		const id = entryId(query, mode);
		const exact = this.entries.get(id);
		if (exact) return exact.answer;

		// BM25 fuzzy match
		const results = this.index.search(`${mode} ${query}`, 3);
		for (const r of results) {
			const entry = this.entries.get(r.id);
			if (entry && entry.mode === mode && r.score > SIMILARITY_THRESHOLD) {
				return entry.answer;
			}
		}

		return null;
	}

	/** Force-expire all entries (for testing) */
	expireAll(): void {
		this.entries = new Map();
		this.index = new BM25Index();
	}

	private purgeExpired(): void {
		const cutoff = Date.now() - TTL_MS;
		for (const [id, entry] of this.entries) {
			if (entry.cachedAt <= cutoff) {
				this.entries.delete(id);
			}
		}
		this.rebuildIndex();
	}

	private rebuildIndex(): void {
		this.index = new BM25Index();
		for (const [id, entry] of this.entries) {
			this.index.add(id, `${entry.mode} ${entry.query}`);
		}
	}

	private async save(): Promise<void> {
		const arr = Array.from(this.entries.values());
		const tmp = `${this.filePath}.tmp`;
		await writeFile(tmp, JSON.stringify(arr, null, 2), "utf-8");
		await rename(tmp, this.filePath);
	}
}
