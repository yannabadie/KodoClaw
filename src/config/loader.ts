import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ConnectorConfig } from "../rag/connector";
import type { CostConfig } from "../security/cost-tracker";

export interface KodoConfig {
	rag: ConnectorConfig;
	cost: Required<CostConfig>;
}

interface YamlRag {
	primary?: string;
	fallback?: string;
	mcp_server?: string;
	gemini_stores?: Record<string, string>;
}

interface YamlCost {
	budget_usd?: number;
	input_cost_per_m?: number;
	output_cost_per_m?: number;
}

interface YamlRoot {
	rag?: YamlRag;
	cost?: YamlCost;
}

const RAG_DEFAULTS: ConnectorConfig = {
	primary: "mcp",
	fallback: "none",
	mcpServerName: "notebooklm-mcp",
};

const COST_DEFAULTS: Required<CostConfig> = {
	budgetUsd: 10,
	inputCostPerM: 3,
	outputCostPerM: 15,
};

/**
 * Load Kodo configuration with priority: env vars > kodo.yaml > defaults.
 * Never throws — returns defaults on any error.
 */
export function loadKodoConfig(baseDir: string): KodoConfig {
	// 1. Try reading kodo.yaml
	let yaml: YamlRoot = {};
	try {
		const raw = readFileSync(join(baseDir, "kodo.yaml"), "utf-8");
		const parsed: unknown = parseYaml(raw);
		if (typeof parsed === "object" && parsed !== null) {
			yaml = parsed as YamlRoot;
		}
	} catch {
		// No config file or parse error — use defaults
	}

	// 2. Build RAG config: yaml defaults, then env overrides
	const yamlRag = yaml.rag ?? {};
	const envGeminiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? undefined;
	const envMcpServer = process.env.KODO_MCP_SERVER;

	const rag: ConnectorConfig = {
		primary: isValidStrategy(yamlRag.primary) ? yamlRag.primary : RAG_DEFAULTS.primary,
		fallback: isValidStrategy(yamlRag.fallback)
			? yamlRag.fallback
			: envGeminiKey
				? "api"
				: (RAG_DEFAULTS.fallback ?? "none"),
		mcpServerName: envMcpServer ?? yamlRag.mcp_server ?? RAG_DEFAULTS.mcpServerName,
		geminiApiKey: envGeminiKey,
		geminiStores: yamlRag.gemini_stores,
	};

	// 3. Build cost config: yaml then defaults
	const yamlCost = yaml.cost ?? {};
	const cost: Required<CostConfig> = {
		budgetUsd: yamlCost.budget_usd ?? COST_DEFAULTS.budgetUsd,
		inputCostPerM: yamlCost.input_cost_per_m ?? COST_DEFAULTS.inputCostPerM,
		outputCostPerM: yamlCost.output_cost_per_m ?? COST_DEFAULTS.outputCostPerM,
	};

	return { rag, cost };
}

function isValidStrategy(s: unknown): s is "mcp" | "api" | "none" {
	return s === "mcp" || s === "api" || s === "none";
}
