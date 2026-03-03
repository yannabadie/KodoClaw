// src/ui/auth.ts
import { createHmac, randomBytes } from "node:crypto";

function hmacSign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function generatePairingToken(secret: string): string {
  const ts = Date.now().toString();
  const nonce = randomBytes(16).toString("hex");
  const payload = `${ts}:${nonce}`;
  const sig = hmacSign(payload, secret);
  return `${payload}:${sig}`;
}

export function verifyPairingToken(token: string, secret: string, ttlMs: number): boolean {
  const parts = token.split(":");
  if (parts.length !== 3) return false;
  const [ts, nonce, sig] = parts as [string, string, string];
  const payload = `${ts}:${nonce}`;
  if (hmacSign(payload, secret) !== sig) return false;
  const age = Date.now() - parseInt(ts);
  return age >= 0 && age <= ttlMs;
}

export function createSessionToken(secret: string): string {
  const payload = `session:${Date.now()}:${randomBytes(16).toString("hex")}`;
  const sig = hmacSign(payload, secret);
  return `${payload}:${sig}`;
}

export function verifySessionToken(token: string, secret: string): boolean {
  const lastColon = token.lastIndexOf(":");
  if (lastColon === -1) return false;
  const payload = token.slice(0, lastColon);
  const sig = token.slice(lastColon + 1);
  return hmacSign(payload, secret) === sig;
}
