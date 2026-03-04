// test/rag/file-search.test.ts
import { describe, expect, test } from "bun:test";
import { parseGeminiResponse } from "../../src/rag/file-search";

describe("parseGeminiResponse", () => {
	test("valid response with text and web sources in groundingChunks", () => {
		const json: Record<string, unknown> = {
			candidates: [
				{
					content: {
						parts: [{ text: "OAuth2 is an authorization framework." }],
					},
					groundingMetadata: {
						groundingChunks: [
							{ web: { uri: "https://example.com/oauth2" } },
							{ web: { uri: "https://docs.example.com/auth" } },
						],
					},
				},
			],
		};

		const result = parseGeminiResponse(json);
		expect(result.answer).toBe("OAuth2 is an authorization framework.");
		expect(result.sources).toEqual(["https://example.com/oauth2", "https://docs.example.com/auth"]);
		expect(result.confidence).toBe(0.8);
	});

	test("valid response with retrievedContext sources", () => {
		const json: Record<string, unknown> = {
			candidates: [
				{
					content: {
						parts: [{ text: "The file contains setup instructions." }],
					},
					groundingMetadata: {
						groundingChunks: [
							{ retrievedContext: { uri: "gs://bucket/doc.pdf" } },
							{ retrievedContext: { uri: "gs://bucket/guide.md" } },
						],
					},
				},
			],
		};

		const result = parseGeminiResponse(json);
		expect(result.answer).toBe("The file contains setup instructions.");
		expect(result.sources).toEqual(["gs://bucket/doc.pdf", "gs://bucket/guide.md"]);
		expect(result.confidence).toBe(0.8);
	});

	test("empty candidates array returns empty answer and empty sources", () => {
		const json: Record<string, unknown> = {
			candidates: [],
		};

		const result = parseGeminiResponse(json);
		expect(result.answer).toBe("");
		expect(result.sources).toEqual([]);
		expect(result.confidence).toBe(0.5);
	});

	test("missing groundingMetadata returns answer with empty sources", () => {
		const json: Record<string, unknown> = {
			candidates: [
				{
					content: {
						parts: [{ text: "A plain answer without grounding." }],
					},
				},
			],
		};

		const result = parseGeminiResponse(json);
		expect(result.answer).toBe("A plain answer without grounding.");
		expect(result.sources).toEqual([]);
		expect(result.confidence).toBe(0.5);
	});

	test("mixed web and retrievedContext sources", () => {
		const json: Record<string, unknown> = {
			candidates: [
				{
					content: {
						parts: [{ text: "Hybrid answer from multiple sources." }],
					},
					groundingMetadata: {
						groundingChunks: [
							{ web: { uri: "https://web.example.com/page" } },
							{ retrievedContext: { uri: "gs://store/file.txt" } },
							{ web: { uri: "https://web.example.com/other" } },
						],
					},
				},
			],
		};

		const result = parseGeminiResponse(json);
		expect(result.answer).toBe("Hybrid answer from multiple sources.");
		expect(result.sources).toEqual([
			"https://web.example.com/page",
			"gs://store/file.txt",
			"https://web.example.com/other",
		]);
		expect(result.confidence).toBe(0.8);
	});

	test("confidence is 0.8 when sources present, 0.5 when empty", () => {
		const withSources: Record<string, unknown> = {
			candidates: [
				{
					content: { parts: [{ text: "Grounded." }] },
					groundingMetadata: {
						groundingChunks: [{ web: { uri: "https://example.com" } }],
					},
				},
			],
		};

		const withoutSources: Record<string, unknown> = {
			candidates: [
				{
					content: { parts: [{ text: "Ungrounded." }] },
				},
			],
		};

		expect(parseGeminiResponse(withSources).confidence).toBe(0.8);
		expect(parseGeminiResponse(withoutSources).confidence).toBe(0.5);
	});
});
