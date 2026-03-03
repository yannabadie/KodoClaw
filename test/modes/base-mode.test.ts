// test/modes/base-mode.test.ts
import { describe, expect, test } from "bun:test";
import { BaseMode, type ModeContext } from "../../src/modes/base-mode";
import type { AutonomyLevel } from "../../src/security/policy";

class TestMode extends BaseMode {
  name = "Test Mode";
  slug = "test";
  instructions = "You are a test mode.";
  allowedTools = ["read", "write"];
  autonomyLevel: AutonomyLevel = "supervised";
}

describe("BaseMode", () => {
  test("exposes all abstract properties", () => {
    const mode = new TestMode();
    expect(mode.name).toBe("Test Mode");
    expect(mode.slug).toBe("test");
    expect(mode.allowedTools).toEqual(["read", "write"]);
    expect(mode.autonomyLevel).toBe("supervised");
  });

  test("has sensible defaults", () => {
    const mode = new TestMode();
    expect(mode.memoryDepth).toBe("summary");
    expect(mode.planningEnabled).toBe(false);
    expect(mode.notebookId).toBeNull();
  });

  test("buildSystemPrompt returns non-empty string", () => {
    const mode = new TestMode();
    const ctx: ModeContext = {
      memoryContext: "User prefers TDD",
      ragContext: null,
      planContext: null,
      profileContext: "stack: TypeScript",
    };
    const prompt = mode.buildSystemPrompt(ctx);
    expect(prompt).toContain("You are a test mode");
    expect(prompt).toContain("User prefers TDD");
    expect(prompt).toContain("stack: TypeScript");
  });

  test("buildSystemPrompt omits empty sections", () => {
    const mode = new TestMode();
    const ctx: ModeContext = {
      memoryContext: "",
      ragContext: null,
      planContext: null,
      profileContext: "",
    };
    const prompt = mode.buildSystemPrompt(ctx);
    expect(prompt).not.toContain("## Memory context");
    expect(prompt).not.toContain("## RAG context");
  });
});
