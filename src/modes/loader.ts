// src/modes/loader.ts
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AutonomyLevel } from "../security/policy";
import { BaseMode } from "./base-mode";
import { ArchitectMode } from "./built-in/architect";
import { AskMode } from "./built-in/ask";
import { CodeMode } from "./built-in/code";
import { DebugMode } from "./built-in/debug";
import { PlanMode } from "./built-in/plan";
import { ReviewMode } from "./built-in/review";

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

const VALID_AUTONOMY: string[] = ["guarded", "supervised", "trusted", "autonomous"];
const BUILTIN_SLUGS: string[] = ["code", "architect", "ask", "debug", "plan", "review"];

function getBuiltInBySlug(slug: string): BaseMode | null {
	switch (slug) {
		case "code":
			return new CodeMode();
		case "architect":
			return new ArchitectMode();
		case "ask":
			return new AskMode();
		case "debug":
			return new DebugMode();
		case "plan":
			return new PlanMode();
		case "review":
			return new ReviewMode();
		default:
			return null;
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
			if (config.autonomy && !VALID_AUTONOMY.includes(config.autonomy)) {
				continue;
			}
			if (config.slug && BUILTIN_SLUGS.includes(config.slug)) {
				continue;
			}

			// Apply extends inheritance: parent provides defaults, child overrides
			if (config.extends) {
				const parent = getBuiltInBySlug(config.extends);
				if (!parent) continue;
				if (!config.allowedTools) config.allowedTools = [...parent.allowedTools];
				if (!config.autonomy) config.autonomy = parent.autonomyLevel;
				if (!config.memory) config.memory = parent.memoryDepth;
				if (config.planning === undefined) config.planning = parent.planningEnabled;
				if (!config.notebook_id) config.notebook_id = parent.notebookId ?? undefined;
			}

			if (config.slug && config.instructions) {
				modes.push(new CustomMode(config));
			}
		} catch {
			// Skip invalid YAML
		}
	}
	return modes;
}
