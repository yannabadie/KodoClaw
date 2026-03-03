/**
 * Sliding Window Rate Limiter
 *
 * Tracks events within a configurable time window and enforces rate limits.
 * Uses a sliding window approach: events older than the window are automatically
 * pruned on each check.
 */

export interface RateLimiterOptions {
	/** Maximum events allowed within the window */
	maxEvents: number;
	/** Window size in milliseconds */
	windowMs: number;
}

export class RateLimiter {
	private timestamps: number[] = [];
	private readonly options: RateLimiterOptions;

	constructor(options: RateLimiterOptions) {
		this.options = options;
	}

	/**
	 * Record an event and check if the rate limit has been exceeded.
	 * Returns true if the event is allowed, false if rate limit exceeded.
	 */
	check(): boolean {
		const now = Date.now();
		this.prune(now);

		if (this.timestamps.length >= this.options.maxEvents) {
			return false;
		}

		this.timestamps.push(now);
		return true;
	}

	/**
	 * Get the current event count within the window.
	 */
	get count(): number {
		this.prune(Date.now());
		return this.timestamps.length;
	}

	/**
	 * Get remaining allowed events in the current window.
	 */
	get remaining(): number {
		return Math.max(0, this.options.maxEvents - this.count);
	}

	/**
	 * Reset the rate limiter (clear all recorded events).
	 */
	reset(): void {
		this.timestamps = [];
	}

	/** Remove timestamps older than the window */
	private prune(now: number): void {
		const cutoff = now - this.options.windowMs;
		// Find first index that is within the window
		let i = 0;
		while (i < this.timestamps.length && this.timestamps[i]! < cutoff) {
			i++;
		}
		if (i > 0) {
			this.timestamps = this.timestamps.slice(i);
		}
	}
}
