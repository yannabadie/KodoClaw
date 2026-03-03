import { describe, expect, test } from "bun:test";
import { isStopWord, stem } from "../../src/memory/stemmer";

describe("stem", () => {
	test("stems -ing suffix", () => {
		expect(stem("running")).toBe("runn");
	});

	test("stems -ation words correctly", () => {
		expect(stem("automation")).toBe("automate");
	});

	test("stems -tion words correctly", () => {
		expect(stem("construction")).toBe("construct");
	});

	test("stems -ed suffix", () => {
		expect(stem("authenticated")).toBe("authenticat");
	});

	test("stems -s plural", () => {
		expect(stem("functions")).toBe("function");
	});

	test("preserves short words", () => {
		expect(stem("cat")).toBe("cat");
	});

	test("stems -ness suffix", () => {
		expect(stem("darkness")).toBe("dark");
	});

	test("stems -ment suffix", () => {
		expect(stem("deployment")).toBe("deploy");
	});

	test("stems -ly suffix", () => {
		expect(stem("quickly")).toBe("quick");
	});

	test("stems -ies to -y", () => {
		expect(stem("queries")).toBe("query");
	});

	test("stems -sses suffix", () => {
		expect(stem("stresses")).toBe("stress");
	});

	test("stems -sion suffix", () => {
		expect(stem("expression")).toBe("express");
	});

	test("stems -es suffix", () => {
		expect(stem("caches")).toBe("cach");
	});
});

describe("isStopWord", () => {
	test("identifies stop words", () => {
		expect(isStopWord("the")).toBe(true);
		expect(isStopWord("is")).toBe(true);
		expect(isStopWord("a")).toBe(true);
		expect(isStopWord("and")).toBe(true);
		expect(isStopWord("for")).toBe(true);
	});

	test("rejects non-stop words", () => {
		expect(isStopWord("code")).toBe(false);
		expect(isStopWord("function")).toBe(false);
		expect(isStopWord("typescript")).toBe(false);
	});

	test("is case-insensitive", () => {
		expect(isStopWord("The")).toBe(true);
		expect(isStopWord("IS")).toBe(true);
	});
});
