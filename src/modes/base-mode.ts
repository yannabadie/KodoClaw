// src/modes/base-mode.ts
import type { AutonomyLevel } from "../security/policy";

export interface ModeContext {
  memoryContext: string;
  ragContext: string | null;
  planContext: string | null;
  profileContext: string;
}

export abstract class BaseMode {
  abstract name: string;
  abstract slug: string;
  abstract instructions: string;
  abstract allowedTools: string[];
  abstract autonomyLevel: AutonomyLevel;

  memoryDepth: "full" | "summary" | "none" = "summary";
  planningEnabled = false;
  notebookId: string | null = null;

  buildSystemPrompt(ctx: ModeContext): string {
    const sections: string[] = [];

    sections.push("<!-- INSTRUCTIONS -->");
    sections.push("## Role");
    sections.push(this.instructions);

    if (ctx.profileContext) {
      sections.push("\n## User Profile");
      sections.push(ctx.profileContext);
    }

    if (ctx.memoryContext) {
      sections.push("\n## Memory context");
      sections.push(ctx.memoryContext);
    }

    if (ctx.ragContext) {
      sections.push("\n## RAG context (from NotebookLM)");
      sections.push(ctx.ragContext);
    }

    if (ctx.planContext) {
      sections.push("\n## Active plan");
      sections.push(ctx.planContext);
    }

    sections.push("\n## Constraints");
    sections.push(`Autonomy: ${this.autonomyLevel}`);
    sections.push(`Allowed tools: ${this.allowedTools.join(", ")}`);

    sections.push("\n<!-- USER DATA -->");

    return sections.join("\n");
  }
}
