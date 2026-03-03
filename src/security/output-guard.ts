/**
 * Output guard: detect dangerous executable patterns in LLM output.
 * Covers OWASP ASI05 (Unexpected Code Execution) and LLM05 (Improper Output Handling).
 */

const DANGEROUS_OUTPUT_PATTERNS: { pattern: RegExp; threat: string }[] = [
	{ pattern: /<script\b[^>]*>/i, threat: "xss_script_tag" },
	{ pattern: /javascript\s*:/i, threat: "xss_javascript_uri" },
	{ pattern: /on\w+\s*=\s*["']/i, threat: "xss_event_handler" },
	{ pattern: /\beval\s*\(/, threat: "code_eval" },
	{ pattern: /\bFunction\s*\(/, threat: "code_function_constructor" },
	{ pattern: /\bimport\s*\(/, threat: "code_dynamic_import" },
	{ pattern: /child_process/, threat: "code_child_process" },
	{ pattern: /DROP\s+TABLE/i, threat: "sql_drop" },
	{ pattern: /;\s*DELETE\s+FROM/i, threat: "sql_delete" },
	{ pattern: /UNION\s+SELECT/i, threat: "sql_union" },
	{ pattern: /rm\s+-rf\s+\//, threat: "destructive_rm" },
];

export interface OutputGuardResult {
	safe: boolean;
	threats: string[];
}

export function guardOutput(output: string): OutputGuardResult {
	const threats: string[] = [];
	for (const { pattern, threat } of DANGEROUS_OUTPUT_PATTERNS) {
		if (pattern.test(output)) {
			threats.push(threat);
		}
	}
	return { safe: threats.length === 0, threats };
}
