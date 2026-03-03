import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import {
	bytesToHex,
	bytesToUtf8,
	concatBytes,
	hexToBytes,
	utf8ToBytes,
} from "@noble/ciphers/utils";
import { randomBytes } from "@noble/ciphers/webcrypto";

const KEY_FILE = ".vault_key";
const VAULT_FILE = "vault.enc";
const ENC_PREFIX = "kodo_enc1:";
const KEY_LENGTH = 32; // 256-bit
const NONCE_LENGTH = 24; // XChaCha20 uses 192-bit nonce

export class Vault {
	private constructor(
		private readonly dir: string,
		private readonly key: Uint8Array,
	) {}

	static async init(dir: string): Promise<Vault> {
		const keyPath = join(dir, KEY_FILE);
		let key: Uint8Array;

		try {
			const hex = await readFile(keyPath, "utf-8");
			key = hexToBytes(hex.trim());
		} catch {
			key = randomBytes(KEY_LENGTH);
			await writeFile(keyPath, bytesToHex(key), "utf-8");
		}

		return new Vault(dir, key);
	}

	async set(name: string, value: string): Promise<void> {
		const data = await this.loadStore();
		data[name] = this.encrypt(value);
		await this.saveStore(data);
	}

	async get(name: string): Promise<string | null> {
		const data = await this.loadStore();
		const encrypted = data[name];
		if (encrypted === undefined) return null;
		return this.decrypt(encrypted);
	}

	async delete(name: string): Promise<void> {
		const data = await this.loadStore();
		delete data[name];
		await this.saveStore(data);
	}

	async list(): Promise<string[]> {
		const data = await this.loadStore();
		return Object.keys(data).sort();
	}

	private encrypt(plaintext: string): string {
		const nonce = randomBytes(NONCE_LENGTH);
		const cipher = xchacha20poly1305(this.key, nonce);
		const ciphertext = cipher.encrypt(utf8ToBytes(plaintext));
		const combined = concatBytes(nonce, ciphertext);
		return `${ENC_PREFIX}${bytesToHex(combined)}`;
	}

	private decrypt(encoded: string): string {
		if (!encoded.startsWith(ENC_PREFIX)) {
			throw new Error(`Invalid vault entry: missing ${ENC_PREFIX} prefix`);
		}
		const hex = encoded.slice(ENC_PREFIX.length);
		const combined = hexToBytes(hex);
		const nonce = combined.slice(0, NONCE_LENGTH);
		const ciphertext = combined.slice(NONCE_LENGTH);
		const cipher = xchacha20poly1305(this.key, nonce);
		return bytesToUtf8(cipher.decrypt(ciphertext));
	}

	private async loadStore(): Promise<Record<string, string>> {
		const path = join(this.dir, VAULT_FILE);
		try {
			const text = await readFile(path, "utf-8");
			return JSON.parse(text);
		} catch {
			return {};
		}
	}

	private async saveStore(data: Record<string, string>): Promise<void> {
		const path = join(this.dir, VAULT_FILE);
		await writeFile(path, JSON.stringify(data), "utf-8");
	}
}
