import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Vault } from "./security/vault";

export const PLUGIN_NAME = "kodo";
export const PLUGIN_VERSION = "0.4.1";

const DEFAULT_CONFIG = `# Kodo Configuration
autonomy: trusted
default_mode: code
ui_port: 3700
`;

export async function initKodo(baseDir: string): Promise<void> {
	// Create directory structure
	const dirs = [
		"",
		"memory",
		"memory/cells",
		"memory/scenes",
		"audit",
		"plans",
		"plans/library",
		"modes",
		"rag-cache",
	];
	for (const d of dirs) {
		await mkdir(join(baseDir, d), { recursive: true });
	}

	// Create default config if not exists
	const configPath = join(baseDir, "kodo.yaml");
	const configFile = Bun.file(configPath);
	if (!(await configFile.exists())) {
		await writeFile(configPath, DEFAULT_CONFIG, "utf-8");
	}

	// Initialize vault (creates key if not exists)
	await Vault.init(baseDir);
}
