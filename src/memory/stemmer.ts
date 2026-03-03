/**
 * Simplified Porter Stemmer for English.
 * Handles the most common suffixes without external dependencies.
 */

const STOP_WORDS = new Set([
	"a",
	"an",
	"the",
	"and",
	"or",
	"but",
	"in",
	"on",
	"at",
	"to",
	"for",
	"of",
	"with",
	"by",
	"from",
	"as",
	"is",
	"was",
	"are",
	"were",
	"been",
	"be",
	"have",
	"has",
	"had",
	"do",
	"does",
	"did",
	"will",
	"would",
	"could",
	"should",
	"may",
	"might",
	"shall",
	"can",
	"need",
	"dare",
	"ought",
	"used",
	"it",
	"its",
	"this",
	"that",
	"these",
	"those",
	"i",
	"me",
	"my",
	"we",
	"our",
	"you",
	"your",
	"he",
	"him",
	"his",
	"she",
	"her",
	"they",
	"them",
	"their",
	"what",
	"which",
	"who",
	"when",
	"where",
	"how",
	"not",
	"no",
	"nor",
	"if",
	"then",
	"else",
	"so",
	"up",
	"out",
	"about",
	"into",
	"over",
	"after",
	"before",
]);

export function isStopWord(word: string): boolean {
	return STOP_WORDS.has(word.toLowerCase());
}

/**
 * Apply simplified Porter stemming rules.
 * Handles: -ing, -ed, -ly, -ment, -ness, -tion, -sion, -ies, -es, -s
 */
export function stem(word: string): string {
	let w = word.toLowerCase();
	if (w.length <= 3) return w;

	// Step 1: Plurals and past tenses
	if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
	else if (w.endsWith("sses")) w = w.slice(0, -2);
	else if (w.endsWith("ness")) w = w.slice(0, -4);
	else if (w.endsWith("ment")) w = w.slice(0, -4);
	else if (w.endsWith("tion")) w = w.slice(0, -4) + "t";
	else if (w.endsWith("sion")) w = w.slice(0, -4) + "s";
	else if (w.endsWith("ation")) w = w.slice(0, -5) + "ate";
	else if (w.endsWith("ling") && w.length > 4) w = w.slice(0, -3);
	else if (w.endsWith("ating")) w = w.slice(0, -3) + "e";
	else if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
	else if (w.endsWith("ated")) w = w.slice(0, -2);
	else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
	else if (w.endsWith("ly") && w.length > 4) w = w.slice(0, -2);
	else if (w.endsWith("es") && w.length > 3) w = w.slice(0, -2);
	else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) w = w.slice(0, -1);

	return w;
}
