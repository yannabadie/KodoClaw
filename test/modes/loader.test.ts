// test/modes/loader.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCustomModes } from "../../src/modes/loader";

describe("YAML mode loader", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-modes-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("loads a valid YAML mode", async () => {
		await writeFile(
			join(dir, "devops.yaml"),
			`
name: DevOps Expert
slug: devops
extends: code
autonomy: supervised
memory: full
planning: true
instructions: |
  You are a DevOps expert.
allowedTools:
  - bash
  - read
  - write
`,
		);

		const modes = await loadCustomModes(dir);
		expect(modes.length).toBe(1);
		expect(modes[0]?.slug).toBe("devops");
		expect(modes[0]?.autonomyLevel).toBe("supervised");
		expect(modes[0]?.planningEnabled).toBe(true);
	});

	test("ignores non-yaml files", async () => {
		await writeFile(join(dir, "readme.md"), "# Not a mode");
		const modes = await loadCustomModes(dir);
		expect(modes.length).toBe(0);
	});

	test("handles empty directory", async () => {
		const modes = await loadCustomModes(dir);
		expect(modes.length).toBe(0);
	});

	test("handles missing directory", async () => {
		const modes = await loadCustomModes("/nonexistent/path");
		const modes2 = await loadCustomModes("Z:/nonexistent/path");
		expect(modes.length).toBe(0);
		expect(modes2.length).toBe(0);
	});

	test("rejects mode with invalid autonomy", async () => {
		await writeFile(
			join(dir, "badautonomy.yaml"),
			`
name: Bad Mode
slug: badmode
autonomy: invalid
instructions: Should not load
`,
		);

		const modes = await loadCustomModes(dir);
		expect(modes.length).toBe(0);
	});

	test("rejects mode conflicting with built-in slug", async () => {
		await writeFile(
			join(dir, "override-code.yaml"),
			`
name: Override Code
slug: code
autonomy: supervised
instructions: Should not load
`,
		);

		const modes = await loadCustomModes(dir);
		expect(modes.length).toBe(0);
	});

	test("extends inherits parent allowedTools when not specified", async () => {
		await writeFile(
			join(dir, "secure-review.yaml"),
			`
name: Secure Reviewer
slug: secure-review
extends: review
instructions: Security-focused code review
`,
		);

		const modes = await loadCustomModes(dir);
		expect(modes.length).toBe(1);
		expect(modes[0]?.allowedTools).toEqual(["read", "glob", "grep"]);
		expect(modes[0]?.autonomyLevel).toBe("guarded");
	});

	test("extends allows child to override parent properties", async () => {
		await writeFile(
			join(dir, "power-code.yaml"),
			`
name: Power Coder
slug: power-coder
extends: code
autonomy: supervised
instructions: Careful coding with supervision
`,
		);

		const modes = await loadCustomModes(dir);
		expect(modes.length).toBe(1);
		expect(modes[0]?.autonomyLevel).toBe("supervised");
		expect(modes[0]?.allowedTools).toContain("bash");
		expect(modes[0]?.allowedTools).toContain("agent");
	});

	test("extends with invalid parent slug is skipped", async () => {
		await writeFile(
			join(dir, "bad-extends.yaml"),
			`
name: Bad Extends
slug: bad-extends
extends: nonexistent
instructions: Should not load
`,
		);

		const modes = await loadCustomModes(dir);
		expect(modes.length).toBe(0);
	});

	test("sets notebook binding", async () => {
		await writeFile(
			join(dir, "cyber.yaml"),
			`
name: Cybersec
slug: cybersec
extends: code
autonomy: supervised
notebook: CyberSecBDD
notebook_id: abc123
instructions: Security expert
allowedTools:
  - bash
`,
		);

		const modes = await loadCustomModes(dir);
		expect(modes[0]?.notebookId).toBe("abc123");
	});
});
