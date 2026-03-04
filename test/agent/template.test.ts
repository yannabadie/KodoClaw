import { describe, expect, test } from "bun:test";
import { BUILT_IN_TEMPLATES, isValidTemplate } from "../../src/agent/template";

describe("AgentTemplate", () => {
	describe("BUILT_IN_TEMPLATES", () => {
		test("contains exactly 5 templates", () => {
			expect(BUILT_IN_TEMPLATES).toHaveLength(5);
		});

		test("has correct slugs", () => {
			const slugs = BUILT_IN_TEMPLATES.map((t) => t.slug);
			expect(slugs).toEqual(["code", "architect", "debug", "review", "security-audit"]);
		});

		test("code template has trusted autonomy and full tools", () => {
			const code = BUILT_IN_TEMPLATES.find((t) => t.slug === "code");
			expect(code).toBeDefined();
			expect(code?.autonomyLevel).toBe("trusted");
			expect(code?.tools).toContain("bash");
			expect(code?.tools).toContain("write");
			expect(code?.tools).toContain("edit");
			expect(code?.tools).toContain("read");
			expect(code?.tools).toContain("glob");
			expect(code?.tools).toContain("grep");
			expect(code?.tools).toContain("agent");
		});

		test("review template has guarded autonomy and read-only tools", () => {
			const review = BUILT_IN_TEMPLATES.find((t) => t.slug === "review");
			expect(review).toBeDefined();
			expect(review?.autonomyLevel).toBe("guarded");
			expect(review?.tools).toEqual(["read", "glob", "grep"]);
			expect(review?.tools).not.toContain("bash");
			expect(review?.tools).not.toContain("write");
			expect(review?.tools).not.toContain("edit");
		});

		test("all templates have required fields", () => {
			for (const template of BUILT_IN_TEMPLATES) {
				expect(typeof template.name).toBe("string");
				expect(typeof template.slug).toBe("string");
				expect(typeof template.description).toBe("string");
				expect(Array.isArray(template.tools)).toBe(true);
				expect(typeof template.instructions).toBe("string");
				expect(typeof template.autonomyLevel).toBe("string");
				expect(typeof template.memoryDepth).toBe("string");
				expect(typeof template.planningEnabled).toBe("boolean");
			}
		});
	});

	describe("isValidTemplate", () => {
		test("accepts a valid template", () => {
			const valid = {
				name: "Test",
				slug: "test",
				description: "A test template",
				tools: ["read"],
				instructions: "Do things",
				autonomyLevel: "guarded",
				memoryDepth: "none",
				planningEnabled: false,
			};
			expect(isValidTemplate(valid)).toBe(true);
		});

		test("rejects null", () => {
			expect(isValidTemplate(null)).toBe(false);
		});

		test("rejects undefined", () => {
			expect(isValidTemplate(undefined)).toBe(false);
		});

		test("rejects a string", () => {
			expect(isValidTemplate("not a template")).toBe(false);
		});

		test("rejects object missing name", () => {
			const invalid = {
				slug: "test",
				description: "A test",
				tools: ["read"],
				instructions: "Do things",
				autonomyLevel: "guarded",
				memoryDepth: "none",
				planningEnabled: false,
			};
			expect(isValidTemplate(invalid)).toBe(false);
		});

		test("rejects object with non-array tools", () => {
			const invalid = {
				name: "Test",
				slug: "test",
				description: "A test",
				tools: "read",
				instructions: "Do things",
				autonomyLevel: "guarded",
				memoryDepth: "none",
				planningEnabled: false,
			};
			expect(isValidTemplate(invalid)).toBe(false);
		});

		test("rejects object with non-boolean planningEnabled", () => {
			const invalid = {
				name: "Test",
				slug: "test",
				description: "A test",
				tools: ["read"],
				instructions: "Do things",
				autonomyLevel: "guarded",
				memoryDepth: "none",
				planningEnabled: "true",
			};
			expect(isValidTemplate(invalid)).toBe(false);
		});

		test("accepts all built-in templates", () => {
			for (const template of BUILT_IN_TEMPLATES) {
				expect(isValidTemplate(template)).toBe(true);
			}
		});
	});
});
