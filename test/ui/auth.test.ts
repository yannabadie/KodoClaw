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

  test("rejects tokens with single-character mutations", () => {
    const pairing = generatePairingToken(secret);
    const session = createSessionToken(secret);

    // Flip one character in the signature portion of the pairing token
    const pairingChars = pairing.split("");
    const lastChar = pairingChars[pairingChars.length - 1] as string;
    pairingChars[pairingChars.length - 1] = lastChar === "a" ? "b" : "a";
    expect(verifyPairingToken(pairingChars.join(""), secret, 300_000)).toBe(false);

    // Flip one character in the signature portion of the session token
    const sessionChars = session.split("");
    const lastSessionChar = sessionChars[sessionChars.length - 1] as string;
    sessionChars[sessionChars.length - 1] = lastSessionChar === "a" ? "b" : "a";
    expect(verifySessionToken(sessionChars.join(""), secret)).toBe(false);
  });
});
