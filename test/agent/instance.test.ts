import { describe, expect, test } from "bun:test";
import { createBinding } from "../../src/agent/binding";
import { createInstance, isExpired } from "../../src/agent/instance";

describe("AgentInstance", () => {
	describe("createInstance", () => {
		test("generates a UUID id", () => {
			const instance = createInstance("code", "My Agent");
			expect(instance.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		});

		test("sets correct templateSlug", () => {
			const instance = createInstance("architect", "Arch Agent");
			expect(instance.templateSlug).toBe("architect");
		});

		test("sets correct name", () => {
			const instance = createInstance("code", "My Coding Agent");
			expect(instance.name).toBe("My Coding Agent");
		});

		test("sets binding to null by default", () => {
			const instance = createInstance("code", "Agent");
			expect(instance.binding).toBeNull();
		});

		test("accepts explicit null binding", () => {
			const instance = createInstance("code", "Agent", null);
			expect(instance.binding).toBeNull();
		});

		test("accepts a KnowledgeBinding", () => {
			const binding = createBinding("file_search", "res-1");
			const instance = createInstance("code", "Agent", binding);
			expect(instance.binding).toBe(binding);
			expect(instance.binding?.backend).toBe("file_search");
		});

		test("sets createdAt to an ISO date string", () => {
			const before = new Date().toISOString();
			const instance = createInstance("code", "Agent");
			const after = new Date().toISOString();
			expect(instance.createdAt >= before).toBe(true);
			expect(instance.createdAt <= after).toBe(true);
		});

		test("accepts optional ttlMs", () => {
			const instance = createInstance("code", "Agent", null, 300000);
			expect(instance.ttlMs).toBe(300000);
		});

		test("ttlMs is undefined when not provided", () => {
			const instance = createInstance("code", "Agent");
			expect(instance.ttlMs).toBeUndefined();
		});

		test("generates unique ids", () => {
			const i1 = createInstance("code", "Agent 1");
			const i2 = createInstance("code", "Agent 2");
			expect(i1.id).not.toBe(i2.id);
		});
	});

	describe("isExpired", () => {
		test("returns false when no ttlMs is set", () => {
			const instance = createInstance("code", "Agent");
			expect(isExpired(instance)).toBe(false);
		});

		test("returns false for a freshly created instance with ttl", () => {
			const instance = createInstance("code", "Agent", null, 60000);
			expect(isExpired(instance)).toBe(false);
		});

		test("returns true for an expired instance", () => {
			const instance = createInstance("code", "Agent", null, 1000);
			// Backdate createdAt to make it expired
			instance.createdAt = new Date(Date.now() - 2000).toISOString();
			expect(isExpired(instance)).toBe(true);
		});

		test("returns false when ttlMs is 0", () => {
			const instance = createInstance("code", "Agent", null, 0);
			expect(isExpired(instance)).toBe(false);
		});
	});
});
