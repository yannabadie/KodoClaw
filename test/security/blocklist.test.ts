import { describe, expect, test } from "bun:test";
import {
	isConfidentialContent,
	isSensitivePath,
	redactConfidential,
} from "../../src/security/blocklist";

describe("isSensitivePath", () => {
	test("blocks .env files", () => {
		expect(isSensitivePath(".env")).toBe(true);
		expect(isSensitivePath(".env.local")).toBe(true);
		expect(isSensitivePath("/app/.env.production")).toBe(true);
	});
	test("blocks SSH keys", () => {
		expect(isSensitivePath("id_rsa")).toBe(true);
		expect(isSensitivePath("/home/user/.ssh/id_ed25519")).toBe(true);
	});
	test("blocks sensitive directories", () => {
		expect(isSensitivePath("/home/user/.aws/credentials")).toBe(true);
		expect(isSensitivePath(".kube/config")).toBe(true);
		expect(isSensitivePath(".docker/config.json")).toBe(true);
	});
	test("blocks sensitive suffixes", () => {
		expect(isSensitivePath("cert.pem")).toBe(true);
		expect(isSensitivePath("server.key")).toBe(true);
		expect(isSensitivePath("client.p12")).toBe(true);
	});
	test("allows regular files", () => {
		expect(isSensitivePath("src/main.ts")).toBe(false);
		expect(isSensitivePath("README.md")).toBe(false);
		expect(isSensitivePath("package.json")).toBe(false);
	});
	test("case-insensitive matching", () => {
		expect(isSensitivePath("ID_RSA")).toBe(true);
		expect(isSensitivePath(".ENV")).toBe(true);
	});
});

describe("isConfidentialContent", () => {
	test("detects OpenAI API keys", () => {
		expect(isConfidentialContent("sk-abc123def456ghi789jkl012mno345pq")).toBe(true);
	});
	test("detects AWS access keys", () => {
		expect(isConfidentialContent("AKIAIOSFODNN7EXAMPLE")).toBe(true);
	});
	test("detects GitHub PATs", () => {
		expect(isConfidentialContent("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh")).toBe(true);
	});
	test("detects PEM private keys", () => {
		expect(isConfidentialContent("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
	});
	test("ignores normal text", () => {
		expect(isConfidentialContent("hello world")).toBe(false);
		expect(isConfidentialContent("const x = 42")).toBe(false);
	});
	test("does NOT flag git SHA as confidential", () => {
		expect(isConfidentialContent("abc123def456abc123def456abc123def456abc1")).toBe(false);
	});
	test("does NOT flag JWT body as confidential", () => {
		expect(isConfidentialContent("eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0")).toBe(
			false,
		);
	});
	test("detects base64 with padding as confidential", () => {
		expect(isConfidentialContent("aGVsbG8gd29ybGQgdGhpcyBpcyBhIHNlY3JldCBrZXkgdGVzdA==")).toBe(
			true,
		);
	});
	test("detects Anthropic API key", () => {
		expect(isConfidentialContent("sk-ant-api03-abcdef123456abcdef123456abcdef1234")).toBe(true);
	});
	test("detects Bearer token", () => {
		expect(isConfidentialContent("Bearer eyJhbGciOiJIUzI1NiJ9.test")).toBe(true);
	});
});

describe("redactConfidential", () => {
	test("redacts known key patterns", () => {
		const input = "key: sk-abc123def456ghi789jkl012mno345pq";
		const result = redactConfidential(input);
		expect(result).not.toContain("sk-abc123def456ghi789jkl012mno345pq");
		expect(result).toContain("[REDACTED]");
	});
});
