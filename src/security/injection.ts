/**
 * Prompt Injection Guard — Aho-Corasick multi-pattern scanner.
 *
 * Builds a trie + fail-link automaton at module load so every call to
 * `scanForInjection` runs in O(n + m) where n = text length and m = total
 * matches. No regex back-tracking, no per-call allocation of pattern lists.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type InjectionAction = "clean" | "flag" | "sanitize" | "block";

export interface InjectionResult {
	score: number;
	action: InjectionAction;
	matches: string[];
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const INJECTION_MARKERS: readonly string[] = [
	"ignore previous instructions",
	"ignore all previous",
	"disregard above",
	"system:",
	"<|im_start|>",
	"<|im_end|>",
	"important: new instructions",
	"you are now",
	"act as root",
	"execute the following",
	"base64 encode and send",

	// Anthropic-specific control tokens
	"\nHuman:",
	"\nAssistant:",
	"</s>",

	// XML/HTML control tags used in system prompts
	"<system>",
	"</system>",
	"<human>",
	"<assistant>",
	"<tool_use>",
	"<antthinking>",

	// Additional prompt injection phrases
	"override your instructions",
	"forget everything above",
	"new system prompt",
	"jailbreak",
	"do anything now",
	"developer mode",

	// Roleplay-based injection
	"pretend you are",
	"imagine you're a",
	"roleplay as",
	"in this fictional scenario",
];

// ---------------------------------------------------------------------------
// Unicode homoglyph normalization
// ---------------------------------------------------------------------------

/** Normalize common Unicode homoglyphs to ASCII equivalents */
function normalizeHomoglyphs(text: string): string {
	const homoglyphs: Record<string, string> = {
		"\u0430": "a", // Cyrillic а → Latin a
		"\u043E": "o", // Cyrillic о → Latin o
		"\u0435": "e", // Cyrillic е → Latin e
		"\u0440": "p", // Cyrillic р → Latin p
		"\u0441": "c", // Cyrillic с → Latin c
		"\u0443": "y", // Cyrillic у → Latin y
		"\u0445": "x", // Cyrillic х → Latin x
		"\u0456": "i", // Cyrillic і → Latin i
		"\u0455": "s", // Cyrillic ѕ → Latin s
		"\u04BB": "h", // Cyrillic һ → Latin h
	};
	let result = text;
	for (const [cyrillic, latin] of Object.entries(homoglyphs)) {
		result = result.replaceAll(cyrillic, latin);
	}

	// Strip zero-width characters used for evasion
	result = result.replace(/\u200B|\u200C|\u200D|\uFEFF|\u00AD/g, "");

	return result;
}

// ---------------------------------------------------------------------------
// Aho-Corasick automaton
// ---------------------------------------------------------------------------

interface TrieNode {
	/** child edges keyed by character */
	children: Map<string, number>;
	/** fail / suffix link — index into `nodes` */
	fail: number;
	/** pattern indices that end at this node (including via suffix links) */
	output: number[];
}

function buildAutomaton(patterns: readonly string[]): {
	nodes: TrieNode[];
	patterns: string[];
} {
	// All patterns stored in lowercase for case-insensitive matching.
	const lower = patterns.map((p) => p.toLowerCase());

	const nodes: TrieNode[] = [{ children: new Map(), fail: 0, output: [] }];

	// --- Phase 1: build the trie -------------------------------------------
	for (let pi = 0; pi < lower.length; pi++) {
		let cur = 0;
		for (const ch of lower[pi]) {
			let next = nodes[cur].children.get(ch);
			if (next === undefined) {
				next = nodes.length;
				nodes[cur].children.set(ch, next);
				nodes.push({ children: new Map(), fail: 0, output: [] });
			}
			cur = next;
		}
		nodes[cur].output.push(pi);
	}

	// --- Phase 2: build fail links via BFS ---------------------------------
	const queue: number[] = [];

	// Depth-1 nodes all fail back to root (0).
	for (const child of nodes[0].children.values()) {
		nodes[child].fail = 0;
		queue.push(child);
	}

	let head = 0;
	while (head < queue.length) {
		const u = queue[head++];
		for (const [ch, v] of nodes[u].children) {
			// Walk up fail links of u until we find a node with an edge on `ch`.
			let f = nodes[u].fail;
			while (f !== 0 && !nodes[f].children.has(ch)) {
				f = nodes[f].fail;
			}
			const failTarget = nodes[f].children.get(ch);
			nodes[v].fail = failTarget !== undefined && failTarget !== v ? failTarget : 0;

			// Merge output lists via the suffix/output link.
			nodes[v].output = nodes[v].output.concat(nodes[nodes[v].fail].output);

			queue.push(v);
		}
	}

	return { nodes, patterns: lower };
}

// Build the automaton once at module load.
const automaton = buildAutomaton(INJECTION_MARKERS);

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Scan `text` for known prompt-injection markers in O(n) time.
 *
 * Returns a score (number of distinct pattern hits), a recommended action,
 * and the list of matched pattern strings.
 */
export function scanForInjection(text: string): InjectionResult {
	const { nodes, patterns } = automaton;
	const normalized = normalizeHomoglyphs(text);
	const lower = normalized.toLowerCase();

	const seen = new Set<number>();
	const matches: string[] = [];

	let state = 0;

	for (const ch of lower) {
		// Follow fail links until we find a matching edge or return to root.
		while (state !== 0 && !nodes[state].children.has(ch)) {
			state = nodes[state].fail;
		}
		const next = nodes[state].children.get(ch);
		state = next !== undefined ? next : 0;

		// Collect all outputs at this state (includes suffix-link outputs).
		for (const pi of nodes[state].output) {
			if (!seen.has(pi)) {
				seen.add(pi);
				matches.push(patterns[pi]);
			}
		}
	}

	const score = matches.length;
	let action: InjectionAction;
	if (score === 0) {
		action = "clean";
	} else if (score === 1) {
		action = "flag";
	} else if (score <= 3) {
		action = "sanitize";
	} else {
		action = "block";
	}

	return { score, action, matches };
}
