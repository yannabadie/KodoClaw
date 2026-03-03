import { describe, expect, test } from "bun:test";
import { guardOutput } from "../../src/security/output-guard";

describe("guardOutput", () => {
	test("detects XSS script tags", () => {
		const result = guardOutput('<script src="evil.js">');
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("xss_script_tag");
	});

	test("detects javascript: URIs", () => {
		const result = guardOutput('href="javascript: alert(1)"');
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("xss_javascript_uri");
	});

	test("detects XSS event handlers", () => {
		const result = guardOutput('<img onerror="alert(1)">');
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("xss_event_handler");
	});

	test("detects eval() calls", () => {
		const result = guardOutput('eval("malicious code")');
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("code_eval");
	});

	test("detects Function constructor", () => {
		const result = guardOutput('new Function("return this")');
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("code_function_constructor");
	});

	test("detects dynamic import()", () => {
		const result = guardOutput('import("malicious-module")');
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("code_dynamic_import");
	});

	test("detects child_process usage", () => {
		const result = guardOutput('require("child_process").exec("rm -rf /")');
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("code_child_process");
	});

	test("detects SQL injection — DROP TABLE", () => {
		const result = guardOutput("DROP TABLE users;");
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("sql_drop");
	});

	test("detects SQL injection — DELETE FROM", () => {
		const result = guardOutput("; DELETE FROM accounts WHERE 1=1");
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("sql_delete");
	});

	test("detects SQL injection — UNION SELECT", () => {
		const result = guardOutput("UNION SELECT password FROM users");
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("sql_union");
	});

	test("detects rm -rf /", () => {
		const result = guardOutput("rm -rf /");
		expect(result.safe).toBe(false);
		expect(result.threats).toContain("destructive_rm");
	});

	test("passes clean output", () => {
		const result = guardOutput("Here is a summary of the refactored module.");
		expect(result.safe).toBe(true);
		expect(result.threats).toHaveLength(0);
	});

	test("detects multiple threats at once", () => {
		const result = guardOutput('<script>eval("DROP TABLE users")</script>');
		expect(result.safe).toBe(false);
		expect(result.threats.length).toBeGreaterThanOrEqual(2);
	});
});
