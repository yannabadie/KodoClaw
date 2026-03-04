import { describe, expect, test } from "bun:test";
import { createBinding, isValidBinding } from "../../src/agent/binding";

describe("KnowledgeBinding", () => {
	describe("createBinding", () => {
		test("generates a UUID id", () => {
			const binding = createBinding("file_search", "res-123");
			expect(binding.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		});

		test("sets correct backend", () => {
			const binding = createBinding("notebooklm", "res-456");
			expect(binding.backend).toBe("notebooklm");
		});

		test("sets correct resourceId", () => {
			const binding = createBinding("file_search", "my-resource");
			expect(binding.resourceId).toBe("my-resource");
		});

		test("defaults citationPolicy to on_demand", () => {
			const binding = createBinding("file_search", "res-123");
			expect(binding.citationPolicy).toBe("on_demand");
		});

		test("accepts custom citationPolicy", () => {
			const binding = createBinding("file_search", "res-123", {
				citationPolicy: "always",
			});
			expect(binding.citationPolicy).toBe("always");
		});

		test("accepts optional topK", () => {
			const binding = createBinding("file_search", "res-123", { topK: 5 });
			expect(binding.topK).toBe(5);
		});

		test("accepts optional metadataFilter", () => {
			const binding = createBinding("file_search", "res-123", {
				metadataFilter: { lang: "en" },
			});
			expect(binding.metadataFilter).toEqual({ lang: "en" });
		});

		test("accepts optional ttlMs", () => {
			const binding = createBinding("none", "res-123", { ttlMs: 60000 });
			expect(binding.ttlMs).toBe(60000);
		});

		test("generates unique ids", () => {
			const b1 = createBinding("file_search", "res-1");
			const b2 = createBinding("file_search", "res-2");
			expect(b1.id).not.toBe(b2.id);
		});
	});

	describe("isValidBinding", () => {
		test("accepts a valid binding", () => {
			const valid = {
				id: "abc-123",
				backend: "file_search",
				resourceId: "res-1",
				citationPolicy: "always",
			};
			expect(isValidBinding(valid)).toBe(true);
		});

		test("accepts a binding created by createBinding", () => {
			const binding = createBinding("notebooklm", "res-1");
			expect(isValidBinding(binding)).toBe(true);
		});

		test("rejects null", () => {
			expect(isValidBinding(null)).toBe(false);
		});

		test("rejects undefined", () => {
			expect(isValidBinding(undefined)).toBe(false);
		});

		test("rejects a number", () => {
			expect(isValidBinding(42)).toBe(false);
		});

		test("rejects object missing id", () => {
			const invalid = {
				backend: "file_search",
				resourceId: "res-1",
				citationPolicy: "always",
			};
			expect(isValidBinding(invalid)).toBe(false);
		});

		test("rejects object with invalid backend", () => {
			const invalid = {
				id: "abc",
				backend: "invalid_backend",
				resourceId: "res-1",
				citationPolicy: "always",
			};
			expect(isValidBinding(invalid)).toBe(false);
		});

		test("rejects object with invalid citationPolicy", () => {
			const invalid = {
				id: "abc",
				backend: "file_search",
				resourceId: "res-1",
				citationPolicy: "invalid_policy",
			};
			expect(isValidBinding(invalid)).toBe(false);
		});

		test("rejects object missing resourceId", () => {
			const invalid = {
				id: "abc",
				backend: "file_search",
				citationPolicy: "always",
			};
			expect(isValidBinding(invalid)).toBe(false);
		});
	});
});
