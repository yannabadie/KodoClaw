/**
 * Recall pipeline utilities: cosine similarity, Reciprocal Rank Fusion, and TF-IDF.
 * Zero external dependencies.
 */

export interface RankedItem {
	id: string;
	score: number;
}

const RRF_K = 60;

/**
 * Compute cosine similarity between two numeric vectors.
 * Returns 0 for empty or zero-magnitude vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length === 0 || b.length === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += (a[i] ?? 0) * (b[i] ?? 0);
		normA += (a[i] ?? 0) ** 2;
		normB += (b[i] ?? 0) ** 2;
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

/**
 * Reciprocal Rank Fusion: combine multiple ranked lists into a single
 * fused ranking. Each item's RRF score is the sum of 1/(k + rank + 1)
 * across all lists where it appears. Uses k=60 (standard default).
 */
export function reciprocalRankFusion(rankedLists: RankedItem[][]): RankedItem[] {
	const scores = new Map<string, number>();
	for (const list of rankedLists) {
		for (let rank = 0; rank < list.length; rank++) {
			const item = list[rank]!;
			const rrf = 1 / (RRF_K + rank + 1);
			scores.set(item.id, (scores.get(item.id) ?? 0) + rrf);
		}
	}
	return [...scores.entries()]
		.map(([id, score]) => ({ id, score }))
		.sort((a, b) => b.score - a.score);
}

/**
 * Build a TF-IDF vector for a document given its terms, a global vocabulary,
 * document frequency map, and total document count.
 */
export function tfidfVector(
	terms: string[],
	vocabulary: string[],
	docFreqs: Map<string, number>,
	totalDocs: number,
): number[] {
	const tf = new Map<string, number>();
	for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
	return vocabulary.map((word) => {
		const termFreq = tf.get(word) ?? 0;
		const docFreq = docFreqs.get(word) ?? 0;
		const idf = docFreq > 0 ? Math.log(totalDocs / docFreq) : 0;
		return termFreq * idf;
	});
}
