// test/cli/commands.test.ts
import { describe, expect, test } from "bun:test";
import { type KodoCommand, parseCommand } from "../../src/cli/commands";

describe("parseCommand", () => {
	test("parses /kodo status", () => {
		const cmd = parseCommand("/kodo status");
		expect(cmd).toEqual({ command: "status", args: [] });
	});

	test("parses /kodo mode create 'DevOps'", () => {
		const cmd = parseCommand("/kodo mode create DevOps");
		expect(cmd).toEqual({ command: "mode", args: ["create", "DevOps"] });
	});

	test("parses /kodo autonomy trusted", () => {
		const cmd = parseCommand("/kodo autonomy trusted");
		expect(cmd).toEqual({ command: "autonomy", args: ["trusted"] });
	});

	test("parses /kodo memory forget ms_auth", () => {
		const cmd = parseCommand("/kodo memory forget ms_auth");
		expect(cmd).toEqual({ command: "memory", args: ["forget", "ms_auth"] });
	});

	test("returns null for non-kodo commands", () => {
		expect(parseCommand("/help")).toBeNull();
		expect(parseCommand("hello")).toBeNull();
	});

	test("parses rag command", () => {
		const result = parseCommand("/kodo rag");
		expect(result).not.toBeNull();
		expect(result?.command).toBe("rag");
	});

	test("parses agent command", () => {
		const result = parseCommand("/kodo agent");
		expect(result).not.toBeNull();
		expect(result?.command).toBe("agent");
	});

	test("parses all recognized commands", () => {
		const cmds = [
			"status",
			"plan",
			"agent",
			"audit",
			"memory",
			"cost",
			"mode",
			"autonomy",
			"stop",
			"undo",
			"health",
			"ui",
			"rag",
		];
		for (const c of cmds) {
			expect(parseCommand(`/kodo ${c}`)).toEqual({ command: c, args: [] });
		}
	});
});
