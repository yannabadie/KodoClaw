import { describe, expect, test } from "bun:test";
import { RateLimiter } from "../../src/security/rate-limiter";

describe("RateLimiter", () => {
	test("allows events under the limit", () => {
		const rl = new RateLimiter({ maxEvents: 5, windowMs: 1000 });
		for (let i = 0; i < 5; i++) {
			expect(rl.check()).toBe(true);
		}
	});

	test("rejects events over the limit", () => {
		const rl = new RateLimiter({ maxEvents: 3, windowMs: 1000 });
		expect(rl.check()).toBe(true);
		expect(rl.check()).toBe(true);
		expect(rl.check()).toBe(true);
		expect(rl.check()).toBe(false);
		expect(rl.check()).toBe(false);
	});

	test("resets count after window expires", async () => {
		const rl = new RateLimiter({ maxEvents: 2, windowMs: 50 });
		expect(rl.check()).toBe(true);
		expect(rl.check()).toBe(true);
		expect(rl.check()).toBe(false);

		// Wait for the window to expire
		await new Promise((resolve) => setTimeout(resolve, 60));

		// Events should be allowed again
		expect(rl.check()).toBe(true);
		expect(rl.check()).toBe(true);
	});

	test("reports correct count", () => {
		const rl = new RateLimiter({ maxEvents: 10, windowMs: 1000 });
		expect(rl.count).toBe(0);
		rl.check();
		expect(rl.count).toBe(1);
		rl.check();
		rl.check();
		expect(rl.count).toBe(3);
	});

	test("reports correct remaining", () => {
		const rl = new RateLimiter({ maxEvents: 5, windowMs: 1000 });
		expect(rl.remaining).toBe(5);
		rl.check();
		expect(rl.remaining).toBe(4);
		rl.check();
		rl.check();
		expect(rl.remaining).toBe(2);
		rl.check();
		rl.check();
		expect(rl.remaining).toBe(0);
	});

	test("reset clears all events", () => {
		const rl = new RateLimiter({ maxEvents: 3, windowMs: 1000 });
		rl.check();
		rl.check();
		rl.check();
		expect(rl.count).toBe(3);
		expect(rl.check()).toBe(false);

		rl.reset();
		expect(rl.count).toBe(0);
		expect(rl.check()).toBe(true);
	});

	test("handles rapid burst then recovery", async () => {
		const rl = new RateLimiter({ maxEvents: 3, windowMs: 50 });

		// Burst: fill the limit
		expect(rl.check()).toBe(true);
		expect(rl.check()).toBe(true);
		expect(rl.check()).toBe(true);
		expect(rl.check()).toBe(false);

		// Wait for the window to slide past the burst
		await new Promise((resolve) => setTimeout(resolve, 60));

		// Should have recovered
		expect(rl.count).toBe(0);
		expect(rl.remaining).toBe(3);
		expect(rl.check()).toBe(true);
	});
});
