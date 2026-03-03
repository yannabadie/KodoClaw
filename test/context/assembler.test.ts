// test/context/assembler.test.ts
import { describe, expect, test } from "bun:test";
import { assembleContext, type AssemblerInput } from "../../src/context/assembler";

describe("assembleContext", () => {
  const baseInput: AssemblerInput = {
    modeInstructions: "You are a code assistant",
    modeSlug: "code",
    autonomyLevel: "trusted",
    allowedTools: ["bash", "read", "write"],
    profileContext: "stack: TypeScript",
    memoryContext: "User refactored auth module last week",
    ragContext: null,
    planContext: null,
  };

  test("includes all provided sections", () => {
    const result = assembleContext(baseInput);
    expect(result).toContain("You are a code assistant");
    expect(result).toContain("stack: TypeScript");
    expect(result).toContain("refactored auth");
    expect(result).toContain("Autonomy: trusted");
    expect(result).toContain("<!-- INSTRUCTIONS -->");
    expect(result).toContain("<!-- USER DATA -->");
  });

  test("omits empty RAG section", () => {
    const result = assembleContext(baseInput);
    expect(result).not.toContain("## RAG context");
  });

  test("includes RAG when provided", () => {
    const result = assembleContext({ ...baseInput, ragContext: "OAuth2 uses authorization code flow" });
    expect(result).toContain("## RAG context");
    expect(result).toContain("authorization code flow");
  });

  test("includes plan when provided", () => {
    const result = assembleContext({ ...baseInput, planContext: "Milestone 2/5: Install deps" });
    expect(result).toContain("## Active plan");
    expect(result).toContain("Milestone 2/5");
  });

  test("stays under token budget", () => {
    const longMemory = "fact. ".repeat(2000);
    const result = assembleContext({ ...baseInput, memoryContext: longMemory });
    // Rough estimate: 1 token ~ 4 chars. Budget: 3000 tokens ~ 12000 chars
    expect(result.length).toBeLessThan(15000);
  });
});
