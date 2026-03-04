import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initKodo } from "../src/index";

describe("kodo init", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-init-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("creates ~/.kodo directory structure", async () => {
		await initKodo(dir);
		const contents = await readdir(dir);
		expect(contents).toContain("memory");
		expect(contents).toContain("audit");
		expect(contents).toContain("plans");
		expect(contents).toContain("modes");
	});

	test("creates memory subdirectories", async () => {
		await initKodo(dir);
		const memContents = await readdir(join(dir, "memory"));
		expect(memContents).toContain("cells");
		expect(memContents).toContain("scenes");
	});

	test("creates default kodo.yaml", async () => {
		await initKodo(dir);
		const config = Bun.file(join(dir, "kodo.yaml"));
		expect(await config.exists()).toBe(true);
	});

	test("creates vault key", async () => {
		await initKodo(dir);
		const key = Bun.file(join(dir, ".vault_key"));
		expect(await key.exists()).toBe(true);
	});

	test("is idempotent (safe to run twice)", async () => {
		await initKodo(dir);
		await initKodo(dir);
		const contents = await readdir(dir);
		expect(contents).toContain("memory");
	});
});
