import { describe, expect, test } from "bun:test";

describe("kodo entry", () => {
	test("exports PLUGIN_NAME constant", async () => {
		const { PLUGIN_NAME } = await import("../src/index");
		expect(PLUGIN_NAME).toBe("kodo");
	});

	test("exports PLUGIN_VERSION constant", async () => {
		const { PLUGIN_VERSION } = await import("../src/index");
		expect(PLUGIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
