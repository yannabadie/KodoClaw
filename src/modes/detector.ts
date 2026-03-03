// src/modes/detector.ts
type BuiltInSlug = "code" | "architect" | "ask" | "debug" | "plan" | "review";

const PATTERNS: Array<{ slug: BuiltInSlug; keywords: RegExp }> = [
  { slug: "ask", keywords: /\b(why|explain|what is|how does|tell me|describe)\b/i },
  { slug: "debug", keywords: /\b(bug|error|crash\w*|doesn't work|fail\w*|broken|exception|undefined|null)\b/i },
  { slug: "architect", keywords: /\b(architecture|design|structure|how should|pattern|scale)\b/i },
  { slug: "review", keywords: /\b(review|check|audit|inspect|evaluate|assess)\b/i },
  { slug: "code", keywords: /\b(add|implement|create|build|refactor|write|update|fix|change)\b/i },
];

export function detectMode(message: string): BuiltInSlug {
  for (const { slug, keywords } of PATTERNS) {
    if (keywords.test(message)) return slug;
  }
  return "code";
}
