// src/context/sufficiency.ts
const MIN_QUERY_LENGTH = 30;

export function checkSufficiency(context: string, minFacts: number): boolean {
	if (!context.trim()) return false;
	const sentences = context.split(/[.!?;\n]/).filter((s) => s.trim().length > 10);
	return sentences.length >= minFacts;
}

export function rewriteQuery(query: string): string {
	if (query.length >= MIN_QUERY_LENGTH) return query;
	return `${query} — provide detailed context about this topic including related components, patterns, and recent changes`;
}
