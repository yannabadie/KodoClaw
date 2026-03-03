// test/modes/built-in.test.ts
import { describe, expect, test } from "bun:test";
import { CodeMode } from "../../src/modes/built-in/code";
import { ArchitectMode } from "../../src/modes/built-in/architect";
import { AskMode } from "../../src/modes/built-in/ask";
import { DebugMode } from "../../src/modes/built-in/debug";
import { PlanMode } from "../../src/modes/built-in/plan";
import { ReviewMode } from "../../src/modes/built-in/review";

describe("built-in modes", () => {
  const modes = [
    { Mode: CodeMode, slug: "code", autonomy: "trusted", planning: true },
    { Mode: ArchitectMode, slug: "architect", autonomy: "supervised", planning: true },
    { Mode: AskMode, slug: "ask", autonomy: "guarded", planning: false },
    { Mode: DebugMode, slug: "debug", autonomy: "trusted", planning: true },
    { Mode: PlanMode, slug: "plan", autonomy: "guarded", planning: true },
    { Mode: ReviewMode, slug: "review", autonomy: "guarded", planning: false },
  ];

  for (const { Mode, slug, autonomy, planning } of modes) {
    test(`${slug} mode has correct properties`, () => {
      const m = new Mode();
      expect(m.slug).toBe(slug);
      expect(m.autonomyLevel).toBe(autonomy);
      expect(m.planningEnabled).toBe(planning);
      expect(m.instructions.length).toBeGreaterThan(20);
      expect(m.allowedTools.length).toBeGreaterThan(0);
    });
  }
});
