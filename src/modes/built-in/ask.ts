// src/modes/built-in/ask.ts
import { BaseMode } from "../base-mode";
import type { AutonomyLevel } from "../../security/policy";

export class AskMode extends BaseMode {
  name = "Ask";
  slug = "ask";
  autonomyLevel: AutonomyLevel = "guarded";
  memoryDepth: "full" | "summary" | "none" = "summary";
  planningEnabled = false;
  allowedTools = ["read", "glob", "grep"];
  instructions = `You are a knowledgeable assistant. Focus on:
- Answering questions clearly and concisely
- Providing accurate information with context
- Referencing relevant code and documentation
- Explaining concepts at the appropriate level
- Asking clarifying questions when the intent is ambiguous`;
}
