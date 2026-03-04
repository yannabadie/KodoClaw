import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KnowledgeBinding } from "../../src/agent/binding";
import { AgentFactory } from "../../src/agent/factory";

describe("AgentFactory", () => {
	let factory: AgentFactory;

	beforeEach(() => {
		factory = new AgentFactory();
	});

	describe("getTemplate", () => {
		test("returns the code template for slug 'code'", () => {
			const t = factory.getTemplate("code");
			expect(t).toBeDefined();
			expect(t?.slug).toBe("code");
			expect(t?.name).toBe("Code");
			expect(t?.autonomyLevel).toBe("trusted");
		});

		test("returns undefined for unknown slug", () => {
			expect(factory.getTemplate("nonexistent")).toBeUndefined();
		});
	});

	describe("createInstance", () => {
		test("creates a valid instance from code template", () => {
			const inst = factory.createInstance("code", "my-agent");
			expect(inst.name).toBe("my-agent");
			expect(inst.templateSlug).toBe("code");
			expect(inst.id).toBeTruthy();
			expect(inst.createdAt).toBeTruthy();
			expect(inst.binding).toBeNull();
		});

		test("throws for unknown template slug", () => {
			expect(() => factory.createInstance("unknown", "x")).toThrow("Unknown template: unknown");
		});

		test("includes binding when provided", () => {
			const binding: KnowledgeBinding = {
				id: "b1",
				backend: "file_search",
				resourceId: "res-123",
				citationPolicy: "always",
			};
			const inst = factory.createInstance("code", "agent-with-kb", binding);
			expect(inst.binding).not.toBeNull();
			expect(inst.binding?.backend).toBe("file_search");
			expect(inst.binding?.resourceId).toBe("res-123");
		});

		test("includes ttlMs when provided", () => {
			const inst = factory.createInstance("code", "ttl-agent", null, 60_000);
			expect(inst.ttlMs).toBe(60_000);
		});
	});

	describe("toClaudeCodeSpec", () => {
		test("returns object with name, tools, instructions, and description", () => {
			const inst = factory.createInstance("code", "spec-agent");
			const spec = factory.toClaudeCodeSpec(inst);
			expect(spec.name).toBe("spec-agent");
			expect(spec.tools).toEqual(["bash", "read", "write", "edit", "glob", "grep", "agent"]);
			expect(typeof spec.instructions).toBe("string");
			expect(typeof spec.description).toBe("string");
		});

		test("appends knowledge binding info to instructions when binding present", () => {
			const binding: KnowledgeBinding = {
				id: "b2",
				backend: "notebooklm",
				resourceId: "nb-456",
				citationPolicy: "always",
			};
			const inst = factory.createInstance("review", "kb-agent", binding);
			const spec = factory.toClaudeCodeSpec(inst);
			const instructions = spec.instructions as string;
			expect(instructions).toContain("Knowledge binding: notebooklm");
			expect(instructions).toContain("resource: nb-456");
			expect(instructions).toContain("Citation policy: always");
		});

		test("does not append binding info when backend is 'none'", () => {
			const binding: KnowledgeBinding = {
				id: "b3",
				backend: "none",
				resourceId: "",
				citationPolicy: "never",
			};
			const inst = factory.createInstance("code", "no-kb", binding);
			const spec = factory.toClaudeCodeSpec(inst);
			const instructions = spec.instructions as string;
			expect(instructions).not.toContain("Knowledge binding");
		});

		test("throws for instance with unknown template slug", () => {
			const inst = factory.createInstance("code", "orphan");
			inst.templateSlug = "deleted-template";
			expect(() => factory.toClaudeCodeSpec(inst)).toThrow("Unknown template: deleted-template");
		});
	});

	describe("writeAgentFile", () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), "kodo-factory-"));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test("creates a .md file with YAML frontmatter", async () => {
			const inst = factory.createInstance("code", "test-agent");
			const filePath = await factory.writeAgentFile(inst, tempDir);

			expect(filePath).toContain("test-agent.md");
			const content = await readFile(filePath, "utf-8");
			expect(content).toContain("---");
			expect(content).toContain("name: test-agent");
			expect(content).toContain("description:");
			expect(content).toContain("# test-agent");
		});

		test("includes knowledge source section when binding present", async () => {
			const binding: KnowledgeBinding = {
				id: "b4",
				backend: "file_search",
				resourceId: "store-789",
				citationPolicy: "on_demand",
			};
			const inst = factory.createInstance("code", "kb-file-agent", binding);
			const filePath = await factory.writeAgentFile(inst, tempDir);
			const content = await readFile(filePath, "utf-8");
			expect(content).toContain("## Knowledge Source");
			expect(content).toContain("Backend: file_search");
			expect(content).toContain("Resource: store-789");
			expect(content).toContain("Citation policy: on_demand");
		});

		test("sanitizes filename by replacing non-alphanumeric chars", async () => {
			const inst = factory.createInstance("code", "my agent/v2");
			const filePath = await factory.writeAgentFile(inst, tempDir);
			expect(filePath).toContain("my-agent-v2.md");
		});

		test("creates directory if it doesn't exist", async () => {
			const nestedDir = join(tempDir, "sub", "dir");
			const inst = factory.createInstance("code", "nested-agent");
			const filePath = await factory.writeAgentFile(inst, nestedDir);
			const content = await readFile(filePath, "utf-8");
			expect(content).toContain("# nested-agent");
		});
	});

	describe("listInstances", () => {
		test("returns created instances", () => {
			factory.createInstance("code", "a1");
			factory.createInstance("review", "a2");
			const list = factory.listInstances();
			expect(list).toHaveLength(2);
			expect(list.map((i) => i.name)).toEqual(["a1", "a2"]);
		});

		test("excludes expired instances", () => {
			const inst = factory.createInstance("code", "short-lived", null, 1);
			// Force the creation time to be in the past
			inst.createdAt = new Date(Date.now() - 10_000).toISOString();
			const list = factory.listInstances();
			expect(list).toHaveLength(0);
		});

		test("returns empty array when no instances exist", () => {
			expect(factory.listInstances()).toHaveLength(0);
		});
	});

	describe("removeInstance", () => {
		test("removes an instance by ID and returns true", () => {
			const inst = factory.createInstance("code", "removable");
			expect(factory.removeInstance(inst.id)).toBe(true);
			expect(factory.listInstances()).toHaveLength(0);
		});

		test("returns false for unknown ID", () => {
			expect(factory.removeInstance("nonexistent-id")).toBe(false);
		});
	});

	describe("custom templates", () => {
		test("registers custom templates alongside built-ins", () => {
			const custom = new AgentFactory([
				{
					name: "Custom",
					slug: "custom",
					description: "A custom agent",
					tools: ["read"],
					instructions: "Custom instructions",
					autonomyLevel: "guarded",
					memoryDepth: "none",
					planningEnabled: false,
				},
			]);
			expect(custom.getTemplate("custom")).toBeDefined();
			expect(custom.getTemplate("code")).toBeDefined();
		});

		test("custom template overrides built-in with same slug", () => {
			const custom = new AgentFactory([
				{
					name: "OverriddenCode",
					slug: "code",
					description: "Overridden code agent",
					tools: ["read"],
					instructions: "Overridden instructions",
					autonomyLevel: "guarded",
					memoryDepth: "none",
					planningEnabled: false,
				},
			]);
			const t = custom.getTemplate("code");
			expect(t?.name).toBe("OverriddenCode");
		});
	});
});
