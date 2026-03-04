import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KnowledgeBinding } from "./binding";
import { type AgentInstance, createInstance as createInst, isExpired } from "./instance";
import { type AgentTemplate, BUILT_IN_TEMPLATES } from "./template";

export class AgentFactory {
	private templates: Map<string, AgentTemplate>;
	private instances: AgentInstance[] = [];

	constructor(customTemplates: AgentTemplate[] = []) {
		this.templates = new Map();
		for (const t of [...BUILT_IN_TEMPLATES, ...customTemplates]) {
			this.templates.set(t.slug, t);
		}
	}

	getTemplate(slug: string): AgentTemplate | undefined {
		return this.templates.get(slug);
	}

	createInstance(
		templateSlug: string,
		name: string,
		binding?: KnowledgeBinding | null,
		ttlMs?: number,
	): AgentInstance {
		const template = this.templates.get(templateSlug);
		if (!template) throw new Error(`Unknown template: ${templateSlug}`);
		const instance = createInst(templateSlug, name, binding, ttlMs);
		this.instances.push(instance);
		return instance;
	}

	toClaudeCodeSpec(instance: AgentInstance): Record<string, unknown> {
		const template = this.templates.get(instance.templateSlug);
		if (!template) throw new Error(`Unknown template: ${instance.templateSlug}`);

		const spec: Record<string, unknown> = {
			name: instance.name,
			description: template.description,
			tools: template.tools,
			instructions: template.instructions,
		};

		if (template.permissionMode) spec.permissionMode = template.permissionMode;
		if (template.disallowedTools) spec.disallowedTools = template.disallowedTools;
		if (template.skills) spec.skills = template.skills;
		if (template.mcpServers) spec.mcpServers = template.mcpServers;
		if (template.maxTurns) spec.maxTurns = template.maxTurns;

		if (instance.binding && instance.binding.backend !== "none") {
			spec.instructions =
				`${template.instructions}\n\nKnowledge binding: ${instance.binding.backend}` +
				` (resource: ${instance.binding.resourceId}).` +
				` Citation policy: ${instance.binding.citationPolicy}.`;
		}

		return spec;
	}

	async writeAgentFile(instance: AgentInstance, dir: string): Promise<string> {
		const template = this.templates.get(instance.templateSlug);
		if (!template) throw new Error(`Unknown template: ${instance.templateSlug}`);

		await mkdir(dir, { recursive: true });
		const filename = `${instance.name.replace(/[^a-zA-Z0-9-]/g, "-")}.md`;
		const filePath = join(dir, filename);

		const lines = [
			"---",
			`name: ${instance.name}`,
			`description: ${template.description}`,
			"---",
			"",
			`# ${instance.name}`,
			"",
			template.instructions,
		];

		if (instance.binding && instance.binding.backend !== "none") {
			lines.push("");
			lines.push("## Knowledge Source");
			lines.push(`Backend: ${instance.binding.backend}`);
			lines.push(`Resource: ${instance.binding.resourceId}`);
			lines.push(`Citation policy: ${instance.binding.citationPolicy}`);
		}

		await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");
		return filePath;
	}

	listInstances(): AgentInstance[] {
		return this.instances.filter((i) => !isExpired(i));
	}

	removeInstance(id: string): boolean {
		const idx = this.instances.findIndex((i) => i.id === id);
		if (idx === -1) return false;
		this.instances.splice(idx, 1);
		return true;
	}
}
