// src/rag/config.ts
import type { ConnectorConfig } from "./connector";

export interface RAGSetupStatus {
	geminiConfigured: boolean;
	mcpConfigured: boolean;
	geminiApiKey: string | null; // masked for display
	mcpServerName: string;
	primary: string;
	fallback: string;
}

/**
 * Load RAG configuration from environment + config.yaml.
 * Priority: env vars > config.yaml > defaults
 */
export function loadRAGConfig(_baseDir?: string): ConnectorConfig {
	const geminiApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? undefined;
	const mcpServerName = process.env.KODO_MCP_SERVER ?? "notebooklm-mcp";

	// Default: MCP primary, API fallback (if key available)
	const config: ConnectorConfig = {
		primary: "mcp",
		fallback: geminiApiKey ? "api" : "none",
		mcpServerName,
		geminiApiKey,
	};

	return config;
}

/**
 * Returns a human-readable status of the RAG setup.
 * API key is masked for security.
 */
export function getRAGSetupStatus(config: ConnectorConfig): RAGSetupStatus {
	const key = config.geminiApiKey;
	const maskedKey = key ? `${key.slice(0, 8)}...${key.slice(-4)}` : null;

	return {
		geminiConfigured: !!config.geminiApiKey,
		mcpConfigured: config.primary === "mcp" || config.fallback === "mcp",
		geminiApiKey: maskedKey,
		mcpServerName: config.mcpServerName ?? "notebooklm-mcp",
		primary: config.primary,
		fallback: config.fallback ?? "none",
	};
}
