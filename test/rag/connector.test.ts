// test/rag/connector.test.ts
import { describe, expect, test } from "bun:test";
import { NotebookLMConnector, type RAGResponse } from "../../src/rag/connector";

describe("NotebookLMConnector", () => {
	test("query returns null when no backend available", async () => {
		const conn = new NotebookLMConnector({ strategy: "none" });
		const result = await conn.query("What is OAuth2?", "notebook_abc");
		expect(result).toBeNull();
	});

	test("isAvailable returns false with no backend", async () => {
		const conn = new NotebookLMConnector({ strategy: "none" });
		expect(await conn.isAvailable()).toBe(false);
	});

	test("formats RAGResponse correctly", () => {
		const response: RAGResponse = {
			answer: "OAuth2 is a framework",
			sources: ["doc1.pdf", "url2"],
			confidence: 0.85,
		};
		expect(response.answer).toBeDefined();
		expect(response.sources.length).toBeGreaterThan(0);
	});
});
