/**
 * BM25 full-text search index.
 * Zero external dependencies. ~150 LOC.
 *
 * BM25 parameters: k1 = 1.5, b = 0.75
 */

import { isStopWord, stem } from "./stemmer";

export interface BM25Result {
	id: string;
	score: number;
}

interface DocEntry {
	/** Term frequency map: term -> count */
	tf: Record<string, number>;
	/** Document length (total token count) */
	dl: number;
}

interface SerializedIndex {
	docs: Record<string, { tf: Record<string, number>; dl: number }>;
	df: Record<string, number>;
	totalDl: number;
}

const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/\W+/)
		.filter((t) => t.length > 0 && !isStopWord(t))
		.map(stem);
}

export class BM25Index {
	/** Document store: id -> DocEntry */
	private docs: Map<string, DocEntry> = new Map();
	/** Document frequency: term -> number of docs containing term */
	private df: Map<string, number> = new Map();
	/** Sum of all document lengths (for computing avgDl) */
	private totalDl = 0;

	/**
	 * Add a document to the index.
	 */
	add(id: string, text: string): void {
		// If the document already exists, remove it first to keep counts consistent
		if (this.docs.has(id)) {
			this.remove(id);
		}

		const tokens = tokenize(text);
		const tf: Record<string, number> = {};

		for (const token of tokens) {
			tf[token] = (tf[token] ?? 0) + 1;
		}

		const entry: DocEntry = { tf, dl: tokens.length };
		this.docs.set(id, entry);
		this.totalDl += entry.dl;

		// Update document frequency for each unique term in this document
		for (const term of Object.keys(tf)) {
			this.df.set(term, (this.df.get(term) ?? 0) + 1);
		}
	}

	/**
	 * Remove a document from the index.
	 */
	remove(id: string): void {
		const entry = this.docs.get(id);
		if (!entry) return;

		this.totalDl -= entry.dl;

		// Decrement document frequency for each term
		for (const term of Object.keys(entry.tf)) {
			const current = this.df.get(term) ?? 0;
			if (current <= 1) {
				this.df.delete(term);
			} else {
				this.df.set(term, current - 1);
			}
		}

		this.docs.delete(id);
	}

	/**
	 * Search the index with a query string.
	 * Returns up to `topK` results sorted by BM25 score descending.
	 */
	search(query: string, topK = 10): BM25Result[] {
		const queryTerms = tokenize(query);
		if (queryTerms.length === 0) return [];

		const N = this.docs.size;
		if (N === 0) return [];

		const avgDl = this.totalDl / N;
		const scores: BM25Result[] = [];

		for (const [id, entry] of this.docs) {
			let score = 0;

			for (const term of queryTerms) {
				const df = this.df.get(term) ?? 0;
				if (df === 0) continue;

				const tf = entry.tf[term] ?? 0;
				if (tf === 0) continue;

				// IDF component
				const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

				// Normalized term frequency
				const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (entry.dl / avgDl)));

				score += idf * tfNorm;
			}

			if (score > 0) {
				scores.push({ id, score });
			}
		}

		scores.sort((a, b) => b.score - a.score);
		return scores.slice(0, topK);
	}

	/**
	 * Serialize the index to a JSON string.
	 */
	serialize(): string {
		const docs: Record<string, { tf: Record<string, number>; dl: number }> = {};
		for (const [id, entry] of this.docs) {
			docs[id] = { tf: entry.tf, dl: entry.dl };
		}

		const df: Record<string, number> = {};
		for (const [term, count] of this.df) {
			df[term] = count;
		}

		const data: SerializedIndex = { docs, df, totalDl: this.totalDl };
		return JSON.stringify(data);
	}

	/**
	 * Reconstruct a BM25Index from a serialized JSON string.
	 */
	static deserialize(json: string): BM25Index {
		const data: SerializedIndex = JSON.parse(json);
		const idx = new BM25Index();

		for (const [id, entry] of Object.entries(data.docs)) {
			idx.docs.set(id, { tf: entry.tf, dl: entry.dl });
		}

		for (const [term, count] of Object.entries(data.df)) {
			idx.df.set(term, count);
		}

		idx.totalDl = data.totalDl;
		return idx;
	}
}
