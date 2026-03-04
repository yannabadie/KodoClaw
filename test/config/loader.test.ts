import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKodoConfig } from "../../src/config/loader";

describe("loadKodoConfig", () => {
	let dir: string;
	const originalEnv = { ...process.env };

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-config-"));
		// Clear env vars that affect config to ensure test isolation
		Reflect.deleteProperty(process.env, "GOOGLE_API_KEY");
		Reflect.deleteProperty(process.env, "GEMINI_API_KEY");
		Reflect.deleteProperty(process.env, "KODO_MCP_SERVER");
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
		process.env = { ...originalEnv };
	});

	test("returns defaults when no kodo.yaml exists", () => {
		const config = loadKodoConfig(dir);
		expect(config.rag.primary).toBe("mcp");
		expect(config.rag.fallback).toBe("none");
		expect(config.cost.budgetUsd).toBe(10);
		expect(config.cost.inputCostPerM).toBe(3);
		expect(config.cost.outputCostPerM).toBe(15);
	});

	test("reads rag section from kodo.yaml", async () => {
		const yaml = "rag:\n  primary: api\n  fallback: mcp\n  mcp_server: my-mcp\n";
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		const config = loadKodoConfig(dir);
		expect(config.rag.primary).toBe("api");
		expect(config.rag.fallback).toBe("mcp");
		expect(config.rag.mcpServerName).toBe("my-mcp");
	});

	test("reads cost section from kodo.yaml", async () => {
		const yaml = "cost:\n  budget_usd: 50\n  input_cost_per_m: 15\n  output_cost_per_m: 75\n";
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		const config = loadKodoConfig(dir);
		expect(config.cost.budgetUsd).toBe(50);
		expect(config.cost.inputCostPerM).toBe(15);
		expect(config.cost.outputCostPerM).toBe(75);
	});

	test("reads gemini_stores from kodo.yaml", async () => {
		const yaml =
			"rag:\n  gemini_stores:\n    code: store-code-123\n    architect: store-arch-456\n";
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		const config = loadKodoConfig(dir);
		expect(config.rag.geminiStores).toEqual({
			code: "store-code-123",
			architect: "store-arch-456",
		});
	});

	test("env vars override kodo.yaml", async () => {
		const yaml = "rag:\n  primary: none\n";
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		process.env.GOOGLE_API_KEY = "env-key-123";
		const config = loadKodoConfig(dir);
		expect(config.rag.geminiApiKey).toBe("env-key-123");
	});

	test("env KODO_MCP_SERVER overrides yaml mcp_server", async () => {
		const yaml = "rag:\n  mcp_server: yaml-mcp\n";
		await writeFile(join(dir, "kodo.yaml"), yaml, "utf-8");
		process.env.KODO_MCP_SERVER = "env-mcp";
		const config = loadKodoConfig(dir);
		expect(config.rag.mcpServerName).toBe("env-mcp");
	});

	test("handles malformed kodo.yaml gracefully", async () => {
		await writeFile(join(dir, "kodo.yaml"), "not: valid: yaml: {{[", "utf-8");
		const config = loadKodoConfig(dir);
		expect(config.rag.primary).toBe("mcp");
	});
});
