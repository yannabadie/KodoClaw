// test/context/sufficiency.test.ts
import { describe, expect, test } from "bun:test";
import { checkSufficiency, rewriteQuery } from "../../src/context/sufficiency";

describe("checkSufficiency", () => {
	test("returns sufficient for rich context", () => {
		const ctx =
			"Authentication uses JWT. Express backend. PostgreSQL database. Session middleware configured.";
		expect(checkSufficiency(ctx, 3)).toBe(true);
	});

	test("returns insufficient for thin context", () => {
		expect(checkSufficiency("", 3)).toBe(false);
		expect(checkSufficiency("one fact", 3)).toBe(false);
	});
});

describe("rewriteQuery", () => {
	test("expands short query", () => {
		const rewritten = rewriteQuery("auth");
		expect(rewritten.length).toBeGreaterThan("auth".length);
	});

	test("returns original if already long", () => {
		const long =
			"How does the authentication system handle JWT token refresh with Redis session store?";
		expect(rewriteQuery(long)).toBe(long);
	});
});
