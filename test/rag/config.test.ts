import { afterEach, describe, expect, test } from "bun:test";
import { getRAGSetupStatus, loadRAGConfig } from "../../src/rag/config";

describe("RAG Config", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		// Restore original env
		process.env = { ...originalEnv };
	});

	test("loads Gemini API key from GOOGLE_API_KEY", () => {
		process.env.GOOGLE_API_KEY = "test-key-123";
		const config = loadRAGConfig();
		expect(config.geminiApiKey).toBe("test-key-123");
		expect(config.fallback).toBe("api");
	});

	test("loads Gemini API key from GEMINI_API_KEY as fallback", () => {
		Reflect.deleteProperty(process.env, "GOOGLE_API_KEY");
		process.env.GEMINI_API_KEY = "gemini-key-456";
		const config = loadRAGConfig();
		expect(config.geminiApiKey).toBe("gemini-key-456");
	});

	test("GOOGLE_API_KEY takes priority over GEMINI_API_KEY", () => {
		process.env.GOOGLE_API_KEY = "google-key";
		process.env.GEMINI_API_KEY = "gemini-key";
		const config = loadRAGConfig();
		expect(config.geminiApiKey).toBe("google-key");
	});

	test("defaults to MCP primary", () => {
		const config = loadRAGConfig();
		expect(config.primary).toBe("mcp");
	});

	test("fallback is 'none' when no API key", () => {
		Reflect.deleteProperty(process.env, "GOOGLE_API_KEY");
		Reflect.deleteProperty(process.env, "GEMINI_API_KEY");
		const config = loadRAGConfig();
		expect(config.fallback).toBe("none");
	});

	test("custom MCP server name from env", () => {
		process.env.KODO_MCP_SERVER = "my-custom-mcp";
		const config = loadRAGConfig();
		expect(config.mcpServerName).toBe("my-custom-mcp");
	});

	test("getRAGSetupStatus masks API key", () => {
		const config = loadRAGConfig();
		config.geminiApiKey = "AIzaSyC3THhd6unXuQFSOHleNemTB5nQh3NXADs";
		const status = getRAGSetupStatus(config);
		expect(status.geminiApiKey).toBe("AIzaSyC3...XADs");
		expect(status.geminiConfigured).toBe(true);
	});

	test("getRAGSetupStatus when no key", () => {
		const config = loadRAGConfig();
		config.geminiApiKey = undefined;
		const status = getRAGSetupStatus(config);
		expect(status.geminiApiKey).toBeNull();
		expect(status.geminiConfigured).toBe(false);
	});
});
