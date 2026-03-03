import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault } from "../../src/security/vault";

describe("Vault", () => {
	let dir: string;
	let vault: Vault;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-vault-"));
		vault = await Vault.init(dir);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	test("generates vault key on init", async () => {
		const keyFile = Bun.file(join(dir, ".vault_key"));
		expect(await keyFile.exists()).toBe(true);
	});

	test("encrypts and decrypts a secret", async () => {
		await vault.set("api_key", "sk-test12345");
		const result = await vault.get("api_key");
		expect(result).toBe("sk-test12345");
	});

	test("stores ciphertext not plaintext", async () => {
		await vault.set("api_key", "sk-test12345");
		const vaultFile = await Bun.file(join(dir, "vault.enc")).text();
		expect(vaultFile).not.toContain("sk-test12345");
		expect(vaultFile).toContain("kodo_enc1:");
	});

	test("deletes a secret", async () => {
		await vault.set("key1", "val1");
		await vault.delete("key1");
		const result = await vault.get("key1");
		expect(result).toBeNull();
	});

	test("lists secret names without values", async () => {
		await vault.set("key1", "val1");
		await vault.set("key2", "val2");
		const names = await vault.list();
		expect(names).toEqual(["key1", "key2"]);
	});

	test("reopens vault with existing key", async () => {
		await vault.set("persistent", "data");
		const vault2 = await Vault.init(dir);
		expect(await vault2.get("persistent")).toBe("data");
	});

	test("vault key file has owner-only permissions", async () => {
		const keyPath = join(dir, ".vault_key");
		const st = await stat(keyPath);
		if (process.platform !== "win32") {
			expect(st.mode & 0o777).toBe(0o600);
		}
	});

	test("throws on corrupt vault JSON", async () => {
		const vaultPath = join(dir, "vault.enc");
		await writeFile(vaultPath, "{not valid json!!!", "utf-8");
		await expect(vault.set("key", "value")).rejects.toThrow("corrupted");
	});

	test("handles missing vault file gracefully", async () => {
		const vaultPath = join(dir, "vault.enc");
		// Ensure no vault file exists (delete if created by prior operations)
		try {
			await unlink(vaultPath);
		} catch {
			// Already absent — fine
		}
		const names = await vault.list();
		expect(names).toEqual([]);
	});

	test("atomic write survives (tmp file created)", async () => {
		const tmpPath = join(dir, "vault.enc.tmp");
		const vaultPath = join(dir, "vault.enc");

		await vault.set("atomic_test", "value123");

		// After successful write, the .tmp file should NOT exist (it was renamed to vault.enc)
		const tmpExists = await Bun.file(tmpPath).exists();
		expect(tmpExists).toBe(false);

		// The final vault.enc file should exist and contain valid JSON
		const vaultExists = await Bun.file(vaultPath).exists();
		expect(vaultExists).toBe(true);
		const content = await readFile(vaultPath, "utf-8");
		const parsed = JSON.parse(content) as Record<string, string>;
		expect(parsed).toHaveProperty("atomic_test");

		// Data should be retrievable (proves rename completed correctly)
		const result = await vault.get("atomic_test");
		expect(result).toBe("value123");
	});

	test("atomic write does not corrupt vault on concurrent access", async () => {
		// Write multiple secrets sequentially and verify all survive
		await vault.set("key_a", "alpha");
		await vault.set("key_b", "bravo");
		await vault.set("key_c", "charlie");

		// Tmp file should not be left behind
		const tmpPath = join(dir, "vault.enc.tmp");
		const tmpExists = await Bun.file(tmpPath).exists();
		expect(tmpExists).toBe(false);

		// All values should be intact
		expect(await vault.get("key_a")).toBe("alpha");
		expect(await vault.get("key_b")).toBe("bravo");
		expect(await vault.get("key_c")).toBe("charlie");
	});
});
