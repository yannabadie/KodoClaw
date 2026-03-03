import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	generateManifest,
	loadManifest,
	saveManifest,
	verifyIntegrity,
} from "../../src/security/integrity";

describe("Skill Integrity Verifier", () => {
	let skillsDir: string;

	beforeEach(async () => {
		skillsDir = await mkdtemp(join(tmpdir(), "kodo-integrity-"));
		// Create a nested skill structure
		await mkdir(join(skillsDir, "kodo-context"), { recursive: true });
		await writeFile(join(skillsDir, "kodo-context", "SKILL.md"), "# Kodo Context Skill\n");
		await writeFile(join(skillsDir, "README.md"), "# Skills\n");
	});

	afterEach(async () => {
		await rm(skillsDir, { recursive: true });
	});

	test("generates manifest for skill files", async () => {
		const manifest = await generateManifest(skillsDir);

		expect(Object.keys(manifest.files).length).toBe(2);
		expect(manifest.files["kodo-context/SKILL.md"]).toBeDefined();
		expect(manifest.files["README.md"]).toBeDefined();
		expect(manifest.generatedAt).toBeTruthy();

		// Hashes should be 64-char hex strings (SHA-256)
		for (const hash of Object.values(manifest.files)) {
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		}
	});

	test("saves and loads manifest", async () => {
		const manifest = await generateManifest(skillsDir);
		await saveManifest(skillsDir, manifest);

		const loaded = await loadManifest(skillsDir);
		expect(loaded).not.toBeNull();
		expect(loaded?.files).toEqual(manifest.files);
		expect(loaded?.generatedAt).toBe(manifest.generatedAt);

		// Verify the file is valid JSON on disk
		const raw = await readFile(join(skillsDir, ".manifest.json"), "utf-8");
		const parsed = JSON.parse(raw);
		expect(parsed.files).toEqual(manifest.files);
	});

	test("verifies valid integrity", async () => {
		const manifest = await generateManifest(skillsDir);
		await saveManifest(skillsDir, manifest);

		const result = await verifyIntegrity(skillsDir);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	test("detects tampered file", async () => {
		const manifest = await generateManifest(skillsDir);
		await saveManifest(skillsDir, manifest);

		// Tamper with a skill file
		await writeFile(join(skillsDir, "kodo-context", "SKILL.md"), "# INJECTED MALICIOUS CONTENT\n");

		const result = await verifyIntegrity(skillsDir);
		expect(result.valid).toBe(false);
		expect(result.issues.length).toBe(1);
		expect(result.issues[0]).toContain("Tampered file");
		expect(result.issues[0]).toContain("kodo-context/SKILL.md");
	});

	test("detects missing file", async () => {
		const manifest = await generateManifest(skillsDir);
		await saveManifest(skillsDir, manifest);

		// Delete a skill file
		await unlink(join(skillsDir, "kodo-context", "SKILL.md"));

		const result = await verifyIntegrity(skillsDir);
		expect(result.valid).toBe(false);
		expect(result.issues.length).toBe(1);
		expect(result.issues[0]).toContain("Missing file");
		expect(result.issues[0]).toContain("kodo-context/SKILL.md");
	});

	test("detects unexpected file", async () => {
		const manifest = await generateManifest(skillsDir);
		await saveManifest(skillsDir, manifest);

		// Add a new unexpected file
		await writeFile(join(skillsDir, "evil-skill.md"), "# Evil\n");

		const result = await verifyIntegrity(skillsDir);
		expect(result.valid).toBe(false);
		expect(result.issues.length).toBe(1);
		expect(result.issues[0]).toContain("Unexpected file");
		expect(result.issues[0]).toContain("evil-skill.md");
	});

	test("returns invalid when no manifest exists", async () => {
		const result = await verifyIntegrity(skillsDir);
		expect(result.valid).toBe(false);
		expect(result.issues.length).toBe(1);
		expect(result.issues[0]).toContain("No manifest found");
	});
});
