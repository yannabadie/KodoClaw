import { describe, expect, test } from "bun:test";
import { isSensitivePath, isConfidentialContent, redactConfidential } from "../../src/security/blocklist";

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
});
