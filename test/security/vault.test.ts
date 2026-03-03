import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, stat, unlink, writeFile } from "node:fs/promises";
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
});
