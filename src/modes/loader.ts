// src/modes/loader.ts
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AutonomyLevel } from "../security/policy";
import { BaseMode } from "./base-mode";

interface YamlModeConfig {
	name: string;
	slug: string;
	extends?: string;
	autonomy?: AutonomyLevel;
	memory?: "full" | "summary" | "none";
	planning?: boolean;
	notebook?: string;
	notebook_id?: string;
	instructions: string;
	allowedTools?: string[];
}

class CustomMode extends BaseMode {
	name: string;
	slug: string;
	instructions: string;
	allowedTools: string[];
	autonomyLevel: AutonomyLevel;

	constructor(config: YamlModeConfig) {
		super();
		this.name = config.name;
		this.slug = config.slug;
		this.instructions = config.instructions;
		this.allowedTools = config.allowedTools ?? ["bash", "read", "write", "edit", "glob", "grep"];
		this.autonomyLevel = config.autonomy ?? "supervised";
		this.memoryDepth = config.memory ?? "summary";
		this.planningEnabled = config.planning ?? false;
		this.notebookId = config.notebook_id ?? null;
	}
}

export async function loadCustomModes(dir: string): Promise<BaseMode[]> {
	let files: string[];
	try {
		files = await readdir(dir);
	} catch {
		return [];
	}

	const modes: BaseMode[] = [];
	for (const f of files) {
		if (!f.endsWith(".yaml") && !f.endsWith(".yml")) continue;
		try {
			const raw = await readFile(join(dir, f), "utf-8");
			const config: YamlModeConfig = parseYaml(raw);
			if (config.slug && config.instructions) {
				modes.push(new CustomMode(config));
			}
		} catch {
			// Skip invalid YAML
		}
	}
	return modes;
}
