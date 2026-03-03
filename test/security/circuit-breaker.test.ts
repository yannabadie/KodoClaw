import { describe, expect, test } from "bun:test";
import { CircuitBreaker } from "../../src/security/circuit-breaker";

describe("CircuitBreaker", () => {
	test("starts in closed state", () => {
		const cb = new CircuitBreaker({ name: "test" });
		expect(cb.currentState).toBe("closed");
	});

	test("stays closed after fewer failures than threshold", async () => {
		const cb = new CircuitBreaker({ failureThreshold: 5, name: "test" });
		for (let i = 0; i < 4; i++) {
			try {
				await cb.execute(() => Promise.reject(new Error("fail")));
			} catch {
				// expected
			}
		}
		expect(cb.currentState).toBe("closed");
	});

	test("opens after reaching failure threshold", async () => {
		const cb = new CircuitBreaker({ failureThreshold: 5, name: "test" });
		for (let i = 0; i < 5; i++) {
			try {
				await cb.execute(() => Promise.reject(new Error("fail")));
			} catch {
				// expected
			}
		}
		expect(cb.currentState).toBe("open");
	});

	test("rejects calls when open without calling fn", async () => {
		const cb = new CircuitBreaker({ failureThreshold: 1, name: "test-svc" });

		// Open the circuit
		try {
			await cb.execute(() => Promise.reject(new Error("fail")));
		} catch {
			// expected
		}
		expect(cb.currentState).toBe("open");

		// Next call should fail immediately without calling fn
		let fnCalled = false;
		try {
			await cb.execute(() => {
				fnCalled = true;
				return Promise.resolve("should not reach");
			});
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toContain("open");
			expect((err as Error).message).toContain("test-svc");
		}
		expect(fnCalled).toBe(false);
	});

	test("transitions to half-open after reset timeout", async () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			resetTimeout: 50,
			name: "test",
		});

		// Open the circuit
		try {
			await cb.execute(() => Promise.reject(new Error("fail")));
		} catch {
			// expected
		}
		expect(cb.currentState).toBe("open");

		// Wait for reset timeout to elapse
		await new Promise((resolve) => setTimeout(resolve, 60));

		expect(cb.currentState).toBe("half_open");
	});

	test("closes on success in half-open state", async () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			resetTimeout: 50,
			name: "test",
		});

		// Open the circuit
		try {
			await cb.execute(() => Promise.reject(new Error("fail")));
		} catch {
			// expected
		}
		expect(cb.currentState).toBe("open");

		// Wait for half-open
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(cb.currentState).toBe("half_open");

		// Successful call should close the circuit
		const result = await cb.execute(() => Promise.resolve("recovered"));
		expect(result).toBe("recovered");
		expect(cb.currentState).toBe("closed");
	});

	test("reopens on failure in half-open state", async () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			resetTimeout: 50,
			name: "test",
		});

		// Open the circuit
		try {
			await cb.execute(() => Promise.reject(new Error("fail")));
		} catch {
			// expected
		}
		expect(cb.currentState).toBe("open");

		// Wait for half-open
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(cb.currentState).toBe("half_open");

		// Failed call should reopen the circuit
		try {
			await cb.execute(() => Promise.reject(new Error("still down")));
		} catch {
			// expected
		}
		expect(cb.currentState).toBe("open");
	});

	test("reset() returns to closed state", async () => {
		const cb = new CircuitBreaker({ failureThreshold: 1, name: "test" });

		// Open the circuit
		try {
			await cb.execute(() => Promise.reject(new Error("fail")));
		} catch {
			// expected
		}
		expect(cb.currentState).toBe("open");

		// Manual reset
		cb.reset();
		expect(cb.currentState).toBe("closed");

		// Should be able to execute again
		const result = await cb.execute(() => Promise.resolve("working"));
		expect(result).toBe("working");
	});
});
