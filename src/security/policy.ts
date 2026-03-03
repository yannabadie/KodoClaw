export type RiskLevel = "low" | "medium" | "high" | "critical";
export type AutonomyLevel = "guarded" | "supervised" | "trusted" | "autonomous";
export type PolicyDecision = "allow" | "confirm" | "block";

const CRITICAL_PATTERNS: RegExp[] = [
	/rm\s+(-rf?|--recursive)\s/,
	/>\s*\/dev\/sd/,
	/mkfs\./,
	/dd\s+if=/,
	/:()\s*\{\s*:\|:&\s*\};:/,
	/curl.*\|\s*(ba)?sh/,
	/wget.*\|\s*(ba)?sh/,
	/sudo\s/,
	/chmod\s+777/,
	/python3?\s+(-c|--command)\s/,
	/node\s+-e\s/,
	/bun\s+eval\s/,
	/powershell.*-enc/,
	/Invoke-Expression/,
	/iex\s/i,
	/\beval\s*\(/,
	/\bexec\s*\(/,
];
const HIGH_PATTERNS: RegExp[] = [
	/\brm\b/,
	/git\s+push/,
	/git\s+reset\s+--hard/,
	/git\s+push\s+--force/,
	/\bkill\b/,
	/npm\s+publish/,
	/\bcurl\b/,
	/\bwget\b/,
	/docker\s+run/,
	/docker\s+exec/,
	/kubectl\s+exec/,
];
const MEDIUM_PATTERNS: RegExp[] = [
	/git\s+commit/,
	/git\s+merge/,
	/git\s+rebase/,
	/npm\s+install/,
	/bun\s+(add|install)/,
	/pip\s+install/,
	/cargo\s+install/,
	/mv\s/,
	/cp\s+-r/,
];

export function classifyShellRisk(command: string): RiskLevel {
	if (CRITICAL_PATTERNS.some((p) => p.test(command))) return "critical";
	if (HIGH_PATTERNS.some((p) => p.test(command))) return "high";
	if (MEDIUM_PATTERNS.some((p) => p.test(command))) return "medium";
	return "low";
}

const POLICY_MATRIX: Record<AutonomyLevel, Record<RiskLevel, PolicyDecision>> = {
	guarded: { low: "allow", medium: "block", high: "block", critical: "block" },
	supervised: { low: "allow", medium: "allow", high: "confirm", critical: "block" },
	trusted: { low: "allow", medium: "allow", high: "allow", critical: "confirm" },
	autonomous: { low: "allow", medium: "allow", high: "allow", critical: "block" },
};

export function shouldConfirm(autonomy: AutonomyLevel, risk: RiskLevel): PolicyDecision {
	return POLICY_MATRIX[autonomy][risk];
}
