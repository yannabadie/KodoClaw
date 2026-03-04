// src/rag/connector.ts
import { CircuitBreaker } from "../security/circuit-breaker";
import type { RAGCache } from "./cache";

export interface RAGResponse {
	answer: string;
	sources: string[];
	confidence: number;
}

export type ConnectorStrategy = "mcp" | "api" | "none";

/**
 * New dual-strategy configuration.
 * Backward compatible: `{ strategy: "none" }` is accepted via the constructor.
 */
export interface ConnectorConfig {
	primary: ConnectorStrategy;
	fallback?: ConnectorStrategy;
	mcpServerName?: string;
	geminiApiKey?: string;
	geminiStores?: Record<string, string>; // { modeSlug: storeId }
}

/** Legacy config shape accepted for backward compatibility. */
interface LegacyConfig {
	strategy: ConnectorStrategy;
	mcpServerName?: string;
	apiKey?: string;
}

type AcceptedConfig = ConnectorConfig | LegacyConfig;

function isLegacyConfig(cfg: AcceptedConfig): cfg is LegacyConfig {
	return "strategy" in cfg && !("primary" in cfg);
}

function normalizeLegacy(cfg: LegacyConfig): ConnectorConfig {
	return {
		primary: cfg.strategy,
		mcpServerName: cfg.mcpServerName,
		geminiApiKey: cfg.apiKey,
	};
}

const MCP_TIMEOUT_MS = 30_000;
const GEMINI_BASE_URL =
	"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export class NotebookLMConnector {
	private config: ConnectorConfig;
	private primaryBreaker: CircuitBreaker;
	private fallbackBreaker: CircuitBreaker;
	private cache: RAGCache | null = null;
	private currentMode = "code";

	constructor(config: AcceptedConfig) {
		this.config = isLegacyConfig(config) ? normalizeLegacy(config) : config;

		this.primaryBreaker = new CircuitBreaker({
			name: "rag-primary",
			failureThreshold: 3,
			resetTimeout: 60_000,
		});

		this.fallbackBreaker = new CircuitBreaker({
			name: "rag-fallback",
			failureThreshold: 3,
			resetTimeout: 60_000,
		});
	}

	/** Attach a cache instance for query result caching. */
	setCache(cache: RAGCache): void {
		this.cache = cache;
	}

	/** Set the current mode slug for cache scoping and Gemini store resolution. */
	setCurrentMode(modeSlug: string): void {
		this.currentMode = modeSlug;
	}

	/** Returns true if at least one strategy is configured (not "none"). */
	isAvailable(): boolean {
		const primary = this.config.primary;
		const fallback = this.config.fallback ?? "none";
		return primary !== "none" || fallback !== "none";
	}

	/**
	 * Query the RAG backend with cache → primary → fallback chain.
	 *
	 * 1. Check cache (if available)
	 * 2. Try primary strategy via circuit breaker
	 * 3. If primary fails or breaker open, try fallback via second circuit breaker
	 * 4. Cache successful results
	 * 5. Return null if both fail
	 */
	async query(question: string, notebookId: string): Promise<RAGResponse | null> {
		if (!this.isAvailable()) return null;

		// 1. Check cache
		if (this.cache) {
			const cached = await this.cache.get(question, this.currentMode);
			if (cached) {
				return { answer: cached, sources: [], confidence: 1.0 };
			}
		}

		// 2. Try primary strategy
		const primaryResult = await this.tryStrategy(
			this.config.primary,
			this.primaryBreaker,
			question,
			notebookId,
		);
		if (primaryResult) {
			await this.cacheResult(question, primaryResult);
			return primaryResult;
		}

		// 3. Try fallback strategy
		const fallback = this.config.fallback ?? "none";
		if (fallback !== "none") {
			const fallbackResult = await this.tryStrategy(
				fallback,
				this.fallbackBreaker,
				question,
				notebookId,
			);
			if (fallbackResult) {
				await this.cacheResult(question, fallbackResult);
				return fallbackResult;
			}
		}

		return null;
	}

	/**
	 * Enrich a notebook with new content via MCP.
	 * Returns true on success, false on error.
	 */
	async enrich(notebookId: string, content: string, title?: string): Promise<boolean> {
		if (this.config.primary !== "mcp" && this.config.fallback !== "mcp") {
			return false;
		}

		const mcpServer = this.config.mcpServerName ?? "notebooklm-mcp";
		const args: Record<string, string> = {
			notebook_id: notebookId,
			content,
		};
		if (title) args.title = title;

		try {
			const result = await this.spawnMCP(mcpServer, "add_source", args);
			return result !== null;
		} catch {
			return false;
		}
	}

	/**
	 * Run deep research on a topic via MCP.
	 * Returns RAGResponse or null on error.
	 */
	async deepResearch(notebookId: string, topic: string): Promise<RAGResponse | null> {
		if (this.config.primary !== "mcp" && this.config.fallback !== "mcp") {
			return null;
		}

		const mcpServer = this.config.mcpServerName ?? "notebooklm-mcp";
		const args = { notebook_id: notebookId, topic };

		try {
			const result = await this.spawnMCP(mcpServer, "deep_research", args);
			if (!result) return null;
			return parseRAGResponse(result);
		} catch {
			return null;
		}
	}

	// ── Private strategy dispatch ──────────────────────────────────────

	private async tryStrategy(
		strategy: ConnectorStrategy,
		breaker: CircuitBreaker,
		question: string,
		notebookId: string,
	): Promise<RAGResponse | null> {
		if (strategy === "none") return null;

		// If breaker is open, skip without throwing
		if (breaker.currentState === "open") return null;

		try {
			return await breaker.execute(async () => {
				switch (strategy) {
					case "mcp":
						return this.queryViaMCP(question, notebookId);
					case "api":
						return this.queryViaAPI(question, notebookId);
					default:
						return null;
				}
			});
		} catch {
			// Circuit breaker threw (open) or strategy failed — return null
			return null;
		}
	}

	// ── MCP subprocess strategy ────────────────────────────────────────

	private async queryViaMCP(question: string, notebookId: string): Promise<RAGResponse | null> {
		const mcpServer = this.config.mcpServerName ?? "notebooklm-mcp";
		const args = { notebook_id: notebookId, question };
		const result = await this.spawnMCP(mcpServer, "ask_question", args);
		if (!result) return null;
		return parseRAGResponse(result);
	}

	/**
	 * Spawn MCP subprocess and parse stdout as JSON.
	 * Throws on timeout or non-zero exit code.
	 */
	private async spawnMCP(
		serverName: string,
		method: string,
		args: Record<string, string>,
	): Promise<Record<string, unknown> | null> {
		const proc = Bun.spawn(["npx", serverName, "call", method, JSON.stringify(args)], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});

		// Apply timeout
		const timeout = setTimeout(() => {
			proc.kill();
		}, MCP_TIMEOUT_MS);

		try {
			const exitCode = await proc.exited;
			clearTimeout(timeout);

			if (exitCode !== 0) {
				throw new Error(`MCP subprocess exited with code ${exitCode}`);
			}

			const stdout = await new Response(proc.stdout).text();
			if (!stdout.trim()) return null;

			const parsed: unknown = JSON.parse(stdout);
			if (typeof parsed === "object" && parsed !== null) {
				return parsed as Record<string, unknown>;
			}
			return null;
		} catch (err) {
			clearTimeout(timeout);
			throw err;
		}
	}

	// ── Gemini File Search API strategy ────────────────────────────────

	private async queryViaAPI(question: string, notebookId: string): Promise<RAGResponse | null> {
		const apiKey = this.config.geminiApiKey;
		if (!apiKey) return null;

		// Resolve store ID from mode slug or use notebookId as fallback
		const storeId = this.config.geminiStores?.[this.currentMode] ?? notebookId;

		const url = `${GEMINI_BASE_URL}?key=${apiKey}`;

		const body = {
			contents: [
				{
					parts: [{ text: question }],
				},
			],
			tools: [
				{
					file_search: {
						store: storeId,
					},
				},
			],
		};

		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
		}

		const data: unknown = await response.json();
		return parseGeminiResponse(data);
	}

	// ── Cache helper ───────────────────────────────────────────────────

	private async cacheResult(question: string, result: RAGResponse): Promise<void> {
		if (this.cache) {
			await this.cache.put(question, result.answer, this.currentMode);
		}
	}
}

// ── Response parsers ───────────────────────────────────────────────────

function parseRAGResponse(data: Record<string, unknown>): RAGResponse | null {
	const answer = typeof data.answer === "string" ? data.answer : "";
	if (!answer) return null;

	const sources = Array.isArray(data.sources)
		? (data.sources.filter((s) => typeof s === "string") as string[])
		: [];
	const confidence = typeof data.confidence === "number" ? data.confidence : 0.5;

	return { answer, sources, confidence };
}

function parseGeminiResponse(data: unknown): RAGResponse | null {
	if (typeof data !== "object" || data === null) return null;

	const obj = data as Record<string, unknown>;
	const candidates = obj.candidates;
	if (!Array.isArray(candidates) || candidates.length === 0) return null;

	const first = candidates[0] as Record<string, unknown>;
	const content = first?.content as Record<string, unknown> | undefined;
	const parts = content?.parts as Array<Record<string, unknown>> | undefined;
	if (!Array.isArray(parts) || parts.length === 0) return null;

	const text = parts[0]?.text;
	if (typeof text !== "string" || !text) return null;

	// Extract sources from grounding metadata if present
	const groundingMetadata = first?.groundingMetadata as Record<string, unknown> | undefined;
	const chunks = groundingMetadata?.groundingChunks as Array<Record<string, unknown>> | undefined;
	const sources: string[] = [];
	if (Array.isArray(chunks)) {
		for (const chunk of chunks) {
			const web = chunk?.web as Record<string, unknown> | undefined;
			if (typeof web?.uri === "string") {
				sources.push(web.uri);
			}
		}
	}

	return { answer: text, sources, confidence: 0.7 };
}
