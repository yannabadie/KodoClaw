import { loadKodoConfig } from "../config/loader";
import type { ConnectorConfig } from "./connector";

export interface RAGSetupStatus {
	geminiConfigured: boolean;
	mcpConfigured: boolean;
	geminiApiKey: string | null;
	mcpServerName: string;
	primary: string;
	fallback: string;
}

/**
 * Load RAG configuration from environment + kodo.yaml.
 * Priority: env vars > kodo.yaml > defaults
 */
export function loadRAGConfig(baseDir?: string): ConnectorConfig {
	return loadKodoConfig(baseDir ?? process.cwd()).rag;
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
