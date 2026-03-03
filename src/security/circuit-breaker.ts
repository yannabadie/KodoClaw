/**
 * Circuit Breaker -- prevents cascading failures by tracking error rates
 * and short-circuiting calls when a service is unhealthy.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is down, requests fail immediately
 * - HALF_OPEN: Testing if service recovered, allowing one request through
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
	/** Number of failures before opening circuit */
	failureThreshold: number;
	/** Time in ms before trying again (half-open) */
	resetTimeout: number;
	/** Name for logging */
	name: string;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
	failureThreshold: 5,
	resetTimeout: 30_000,
	name: "default",
};

export class CircuitBreaker {
	private state: CircuitState = "closed";
	private failureCount = 0;
	private lastFailureTime = 0;
	private readonly options: CircuitBreakerOptions;

	constructor(options?: Partial<CircuitBreakerOptions>) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	get currentState(): CircuitState {
		if (this.state === "open") {
			// Check if reset timeout has elapsed
			if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
				this.state = "half_open";
			}
		}
		return this.state;
	}

	/**
	 * Execute a function through the circuit breaker.
	 * If circuit is open, throws immediately without calling fn.
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		const state = this.currentState;

		if (state === "open") {
			throw new Error(`Circuit breaker "${this.options.name}" is open -- service unavailable`);
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (err) {
			this.onFailure();
			throw err;
		}
	}

	private onSuccess(): void {
		this.failureCount = 0;
		this.state = "closed";
	}

	private onFailure(): void {
		this.failureCount++;
		this.lastFailureTime = Date.now();
		if (this.failureCount >= this.options.failureThreshold) {
			this.state = "open";
		}
	}

	/** Reset the circuit breaker to closed state (for testing or manual recovery) */
	reset(): void {
		this.state = "closed";
		this.failureCount = 0;
		this.lastFailureTime = 0;
	}
}
