import { describe, expect, test } from "bun:test";
import { modeToTemplate } from "../../src/agent/bridge";
import { CodeMode } from "../../src/modes/built-in/code";
import { ReviewMode } from "../../src/modes/built-in/review";

describe("modeToTemplate bridge", () => {
	test("converts CodeMode to template with correct slug and autonomy", () => {
		const mode = new CodeMode();
		const template = modeToTemplate(mode);
		expect(template.slug).toBe("code");
		expect(template.autonomyLevel).toBe("trusted");
		expect(template.name).toBe("Code");
	});

	test("CodeMode template has bash in tools and planningEnabled true", () => {
		const mode = new CodeMode();
		const template = modeToTemplate(mode);
		expect(template.tools).toContain("bash");
		expect(template.planningEnabled).toBe(true);
	});

	test("converts ReviewMode to template with guarded autonomy", () => {
		const mode = new ReviewMode();
		const template = modeToTemplate(mode);
		expect(template.slug).toBe("review");
		expect(template.autonomyLevel).toBe("guarded");
		expect(template.planningEnabled).toBe(false);
	});

	test("ReviewMode template does not include bash in tools", () => {
		const mode = new ReviewMode();
		const template = modeToTemplate(mode);
		expect(template.tools).not.toContain("bash");
		expect(template.tools).toEqual(["read", "glob", "grep"]);
	});

	test("template description contains mode name", () => {
		const codeTemplate = modeToTemplate(new CodeMode());
		expect(codeTemplate.description).toContain("Code");

		const reviewTemplate = modeToTemplate(new ReviewMode());
		expect(reviewTemplate.description).toContain("Review");
	});

	test("template description contains autonomy level", () => {
		const template = modeToTemplate(new CodeMode());
		expect(template.description).toContain("trusted");
	});

	test("template tools is a copy, not the same reference as mode.allowedTools", () => {
		const mode = new CodeMode();
		const template = modeToTemplate(mode);
		expect(template.tools).toEqual(mode.allowedTools);
		expect(template.tools).not.toBe(mode.allowedTools);
	});

	test("template inherits memoryDepth from mode", () => {
		const codeTemplate = modeToTemplate(new CodeMode());
		expect(codeTemplate.memoryDepth).toBe("summary");

		const reviewTemplate = modeToTemplate(new ReviewMode());
		expect(reviewTemplate.memoryDepth).toBe("summary");
	});

	test("template instructions match mode instructions", () => {
		const mode = new CodeMode();
		const template = modeToTemplate(mode);
		expect(template.instructions).toBe(mode.instructions);
	});
});
