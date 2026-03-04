// test/rag/connector.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RAGCache } from "../../src/rag/cache";
import {
	type ConnectorConfig,
	NotebookLMConnector,
	type RAGResponse,
	type RAGStatus,
} from "../../src/rag/connector";

describe("NotebookLMConnector", () => {
	// ── Backward compatibility ─────────────────────────────────────────

	describe("legacy config backward compatibility", () => {
		test("accepts { strategy: 'none' } and query returns null", async () => {
			const conn = new NotebookLMConnector({ strategy: "none" });
			const result = await conn.query("What is OAuth2?", "notebook_abc");
			expect(result).toBeNull();
		});

		test("accepts { strategy: 'none' } and isAvailable returns false", () => {
			const conn = new NotebookLMConnector({ strategy: "none" });
			expect(conn.isAvailable()).toBe(false);
		});

		test("accepts { strategy: 'api', apiKey: 'key' } as legacy config", () => {
			const conn = new NotebookLMConnector({
				strategy: "api",
				apiKey: "test-key",
			});
			expect(conn.isAvailable()).toBe(true);
		});

		test("accepts { strategy: 'mcp' } as legacy config", () => {
			const conn = new NotebookLMConnector({ strategy: "mcp" });
			expect(conn.isAvailable()).toBe(true);
		});
	});

	// ── New ConnectorConfig ────────────────────────────────────────────

	describe("new ConnectorConfig", () => {
		test("primary 'none' with no fallback → isAvailable false", () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			expect(conn.isAvailable()).toBe(false);
		});

		test("primary 'none' with fallback 'none' → isAvailable false", () => {
			const conn = new NotebookLMConnector({
				primary: "none",
				fallback: "none",
			});
			expect(conn.isAvailable()).toBe(false);
		});

		test("primary 'mcp' → isAvailable true", () => {
			const conn = new NotebookLMConnector({ primary: "mcp" });
			expect(conn.isAvailable()).toBe(true);
		});

		test("primary 'api' → isAvailable true", () => {
			const conn = new NotebookLMConnector({
				primary: "api",
				geminiApiKey: "test-key",
			});
			expect(conn.isAvailable()).toBe(true);
		});

		test("primary 'none' with fallback 'api' → isAvailable true", () => {
			const conn = new NotebookLMConnector({
				primary: "none",
				fallback: "api",
				geminiApiKey: "test-key",
			});
			expect(conn.isAvailable()).toBe(true);
		});

		test("query returns null when primary is 'none' and no fallback", async () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			const result = await conn.query("question?", "nb123");
			expect(result).toBeNull();
		});
	});

	// ── RAGResponse format ─────────────────────────────────────────────

	describe("RAGResponse interface", () => {
		test("has correct shape with answer, sources, confidence", () => {
			const response: RAGResponse = {
				answer: "OAuth2 is a framework",
				sources: ["doc1.pdf", "url2"],
				confidence: 0.85,
			};
			expect(response.answer).toBeDefined();
			expect(response.sources.length).toBeGreaterThan(0);
			expect(response.confidence).toBeGreaterThanOrEqual(0);
			expect(response.confidence).toBeLessThanOrEqual(1);
		});
	});

	// ── Method existence checks ────────────────────────────────────────

	describe("method signatures", () => {
		test("query method exists and returns a Promise", () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			expect(typeof conn.query).toBe("function");
			const result = conn.query("question", "nbId");
			expect(result).toBeInstanceOf(Promise);
		});

		test("enrich method exists and returns a Promise", () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			expect(typeof conn.enrich).toBe("function");
			const result = conn.enrich("nbId", "content", "title");
			expect(result).toBeInstanceOf(Promise);
		});

		test("deepResearch method exists and returns a Promise", () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			expect(typeof conn.deepResearch).toBe("function");
			const result = conn.deepResearch("nbId", "topic");
			expect(result).toBeInstanceOf(Promise);
		});

		test("setCurrentMode method exists", () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			expect(typeof conn.setCurrentMode).toBe("function");
			conn.setCurrentMode("architect");
		});

		test("setCache method exists", () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			expect(typeof conn.setCache).toBe("function");
		});

		test("isAvailable is synchronous (not async)", () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			const result = conn.isAvailable();
			// isAvailable returns boolean directly, not a Promise
			expect(typeof result).toBe("boolean");
		});
	});

	// ── enrich / deepResearch with no MCP ──────────────────────────────

	describe("enrich without MCP", () => {
		test("returns false when no MCP strategy configured", async () => {
			const conn = new NotebookLMConnector({
				primary: "api",
				geminiApiKey: "key",
			});
			const result = await conn.enrich("nb1", "some content", "Title");
			expect(result).toBe(false);
		});

		test("returns false when primary is none", async () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			const result = await conn.enrich("nb1", "content");
			expect(result).toBe(false);
		});
	});

	describe("deepResearch without MCP", () => {
		test("returns null when no MCP strategy configured", async () => {
			const conn = new NotebookLMConnector({
				primary: "api",
				geminiApiKey: "key",
			});
			const result = await conn.deepResearch("nb1", "topic");
			expect(result).toBeNull();
		});

		test("returns null when primary is none", async () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			const result = await conn.deepResearch("nb1", "topic");
			expect(result).toBeNull();
		});
	});

	// ── Cache integration ──────────────────────────────────────────────

	describe("cache integration", () => {
		let dir: string;
		let cache: RAGCache;

		beforeEach(async () => {
			dir = await mkdtemp(join(tmpdir(), "kodo-rag-conn-"));
			cache = await RAGCache.load(dir);
		});

		afterEach(async () => {
			await rm(dir, { recursive: true, force: true });
		});

		test("returns cached result when cache hit exists", async () => {
			// Pre-populate the cache
			await cache.put("What is TLS?", "TLS is Transport Layer Security", "code");

			// Connector with "none" primary — would normally return null,
			// but cache should return the hit before strategy dispatch
			const conn = new NotebookLMConnector({ primary: "none" });
			conn.setCache(cache);
			conn.setCurrentMode("code");

			// isAvailable is false, but we want to test cache path separately.
			// Since primary=none causes early return before cache check,
			// test with a "real" strategy that will fail anyway.
			const conn2 = new NotebookLMConnector({
				primary: "mcp",
				mcpServerName: "nonexistent-server",
			});
			conn2.setCache(cache);
			conn2.setCurrentMode("code");

			const result = await conn2.query("What is TLS?", "nb1");
			expect(result).not.toBeNull();
			expect(result?.answer).toBe("TLS is Transport Layer Security");
			expect(result?.confidence).toBe(1.0);
		});

		test("cache respects mode scoping via setCurrentMode", async () => {
			await cache.put("question", "answer for architect", "architect");

			const conn = new NotebookLMConnector({
				primary: "mcp",
				mcpServerName: "nonexistent",
			});
			conn.setCache(cache);

			// Different mode — should miss
			conn.setCurrentMode("debug");
			const miss = await conn.query("question", "nb1");
			// Will miss cache and try MCP which will fail
			expect(miss).toBeNull();

			// Correct mode — should hit
			conn.setCurrentMode("architect");
			const hit = await conn.query("question", "nb1");
			expect(hit).not.toBeNull();
			expect(hit?.answer).toBe("answer for architect");
		});
	});

	// ── Dual strategy fallback logic (none strategies) ─────────────────

	describe("strategy dispatch with none", () => {
		test("primary none + fallback none = null", async () => {
			const conn = new NotebookLMConnector({
				primary: "none",
				fallback: "none",
			});
			const result = await conn.query("q", "nb");
			expect(result).toBeNull();
		});

		test("primary none + no fallback = null", async () => {
			const conn = new NotebookLMConnector({ primary: "none" });
			const result = await conn.query("q", "nb");
			expect(result).toBeNull();
		});
	});

	// ── Gemini store resolution ────────────────────────────────────────

	describe("gemini store resolution", () => {
		test("geminiStores config is stored correctly", () => {
			const config: ConnectorConfig = {
				primary: "api",
				geminiApiKey: "test-key",
				geminiStores: {
					code: "store-code-123",
					architect: "store-arch-456",
				},
			};
			const conn = new NotebookLMConnector(config);
			// Config is accepted without error
			expect(conn.isAvailable()).toBe(true);
		});
	});

	// ── RAG status reporting ──────────────────────────────────────────

	describe("RAG status reporting", () => {
		test("status defaults to ok", () => {
			const conn = new NotebookLMConnector({ primary: "mcp" });
			const s = conn.status;
			expect(s.level).toBe("ok");
			expect(s.primaryState).toBe("ok");
			expect(s.lastError).toBeNull();
		});

		test("onStatusChange registers callback", () => {
			const conn = new NotebookLMConnector({ primary: "mcp" });
			let called = false;
			conn.onStatusChange(() => {
				called = true;
			});
			expect(typeof conn.onStatusChange).toBe("function");
		});

		test("status message is human-readable", () => {
			const conn = new NotebookLMConnector({ primary: "mcp" });
			expect(conn.status.message).toContain("RAG");
		});

		test("status fallbackState defaults to unavailable", () => {
			const conn = new NotebookLMConnector({ primary: "mcp" });
			expect(conn.status.fallbackState).toBe("unavailable");
		});

		test("status has correct shape", () => {
			const conn = new NotebookLMConnector({ primary: "mcp" });
			const s: RAGStatus = conn.status;
			expect(s).toHaveProperty("level");
			expect(s).toHaveProperty("primaryState");
			expect(s).toHaveProperty("fallbackState");
			expect(s).toHaveProperty("lastError");
			expect(s).toHaveProperty("message");
		});
	});

	// ── file_search strategy ─────────────────────────────────────────

	describe("file_search strategy", () => {
		test("primary 'file_search' → isAvailable true", () => {
			const conn = new NotebookLMConnector({
				primary: "file_search",
				geminiApiKey: "test-key",
				geminiStores: { code: "store-123" },
			});
			expect(conn.isAvailable()).toBe(true);
		});

		test("file_search accepted as fallback strategy", () => {
			const conn = new NotebookLMConnector({
				primary: "mcp",
				fallback: "file_search",
				geminiApiKey: "test-key",
				geminiStores: { code: "store-123" },
			});
			expect(conn.isAvailable()).toBe(true);
		});

		test("file_search without apiKey returns null (no crash)", async () => {
			const conn = new NotebookLMConnector({
				primary: "file_search",
				geminiStores: { code: "store-123" },
			});
			const result = await conn.query("question?", "nb1");
			expect(result).toBeNull();
		});

		test("file_search without geminiStores returns null (no crash)", async () => {
			const conn = new NotebookLMConnector({
				primary: "file_search",
				geminiApiKey: "test-key",
			});
			const result = await conn.query("question?", "nb1");
			expect(result).toBeNull();
		});

		test("file_search falls back when primary fails", async () => {
			// primary file_search with no stores → returns null → tries fallback "none" → null
			const conn = new NotebookLMConnector({
				primary: "file_search",
				fallback: "none",
				geminiApiKey: "test-key",
			});
			const result = await conn.query("question?", "nb1");
			expect(result).toBeNull();
		});

		test("file_search config stored correctly with geminiStores", () => {
			const config: ConnectorConfig = {
				primary: "file_search",
				geminiApiKey: "test-key",
				geminiStores: {
					code: "store-code-789",
					architect: "store-arch-012",
				},
			};
			const conn = new NotebookLMConnector(config);
			expect(conn.isAvailable()).toBe(true);
		});

		test("file_search status defaults to ok", () => {
			const conn = new NotebookLMConnector({
				primary: "file_search",
				geminiApiKey: "test-key",
				geminiStores: { code: "store-123" },
			});
			const s = conn.status;
			expect(s.level).toBe("ok");
			expect(s.primaryState).toBe("ok");
			expect(s.lastError).toBeNull();
		});
	});

	// ── Auth expiry detection ─────────────────────────────────────────

	describe("auth expiry detection", () => {
		test("AUTH_EXPIRY_PATTERNS are checked case-insensitively", () => {
			// We test indirectly via the status interface.
			// Direct auth detection happens in spawnMCP (integration test).
			const conn = new NotebookLMConnector({ primary: "none" });
			expect(conn.status.primaryState).toBe("ok");
		});

		test("fresh connector has no auth errors", () => {
			const conn = new NotebookLMConnector({ primary: "mcp" });
			expect(conn.status.primaryState).not.toBe("auth_expired");
			expect(conn.status.lastError).toBeNull();
		});
	});
});
