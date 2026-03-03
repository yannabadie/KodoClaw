import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UserProfile } from "../../src/memory/profile";

describe("UserProfile", () => {
	let dir: string;
	let profile: UserProfile;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "kodo-profile-"));
		profile = await UserProfile.load(join(dir, "profile.json"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("initializes with empty traits", () => {
		expect(profile.getStableTraits()).toEqual({});
		expect(profile.getTemporaryStates()).toEqual({});
	});

	test("sets and gets stable traits", async () => {
		await profile.setTrait("stack", "TypeScript, Bun");
		expect(profile.getStableTraits().stack).toBe("TypeScript, Bun");
	});

	test("sets temporary state with expiry", async () => {
		await profile.setTemporary("focus", "refactoring auth", "2099-12-31");
		const states = profile.getTemporaryStates();
		expect(states.focus?.value).toBe("refactoring auth");
	});

	test("auto-purges expired temporary states", async () => {
		await profile.setTemporary("old", "expired thing", "2020-01-01");
		profile.purgeExpired();
		expect(profile.getTemporaryStates().old).toBeUndefined();
	});

	test("persists and reloads", async () => {
		await profile.setTrait("lang", "French");
		const profile2 = await UserProfile.load(join(dir, "profile.json"));
		expect(profile2.getStableTraits().lang).toBe("French");
	});

	test("renders context string", async () => {
		await profile.setTrait("stack", "TypeScript");
		await profile.setTrait("style", "TDD, small commits");
		const ctx = profile.renderContext();
		expect(ctx).toContain("TypeScript");
		expect(ctx).toContain("TDD");
	});
});
