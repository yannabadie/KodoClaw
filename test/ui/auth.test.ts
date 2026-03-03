// test/ui/auth.test.ts
import { describe, expect, test } from "bun:test";
import { generatePairingToken, verifyPairingToken, createSessionToken, verifySessionToken } from "../../src/ui/auth";

describe("UI auth", () => {
  const secret = "test-secret-key-256-bits-long!!!";

  test("generates a pairing token", () => {
    const token = generatePairingToken(secret);
    expect(token.length).toBeGreaterThan(10);
  });

  test("verifies valid pairing token within TTL", () => {
    const token = generatePairingToken(secret);
    expect(verifyPairingToken(token, secret, 300_000)).toBe(true);
  });

  test("rejects expired pairing token", () => {
    const token = generatePairingToken(secret);
    expect(verifyPairingToken(token, secret, -1)).toBe(false);
  });

  test("creates session token from pairing", () => {
    const session = createSessionToken(secret);
    expect(session.length).toBeGreaterThan(10);
  });

  test("verifies valid session token", () => {
    const session = createSessionToken(secret);
    expect(verifySessionToken(session, secret)).toBe(true);
  });

  test("rejects tampered session token", () => {
    const session = createSessionToken(secret);
    expect(verifySessionToken(session + "x", secret)).toBe(false);
  });
});
