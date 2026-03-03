/**
 * Session Cost Tracker
 *
 * Tracks token usage per session and enforces budget limits.
 * Token costs are estimated using approximate pricing:
 * - Input: $3 per 1M tokens (Sonnet-class)
 * - Output: $15 per 1M tokens (Sonnet-class)
 */

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
}

export interface CostSnapshot {
	totalInputTokens: number;
	totalOutputTokens: number;
	estimatedCostUsd: number;
	budgetRemainingUsd: number;
	budgetExceeded: boolean;
}

// Approximate pricing (USD per million tokens)
const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;

export class CostTracker {
	private totalInputTokens = 0;
	private totalOutputTokens = 0;
	private readonly budgetUsd: number;

	constructor(budgetUsd: number = 10) {
		this.budgetUsd = budgetUsd;
	}

	/**
	 * Record token usage from a tool call or LLM response.
	 */
	record(usage: TokenUsage): void {
		this.totalInputTokens += usage.inputTokens;
		this.totalOutputTokens += usage.outputTokens;
	}

	/**
	 * Get current cost snapshot.
	 */
	get snapshot(): CostSnapshot {
		const estimatedCostUsd = this.estimateCost();
		return {
			totalInputTokens: this.totalInputTokens,
			totalOutputTokens: this.totalOutputTokens,
			estimatedCostUsd,
			budgetRemainingUsd: Math.max(0, this.budgetUsd - estimatedCostUsd),
			budgetExceeded: estimatedCostUsd >= this.budgetUsd,
		};
	}

	/**
	 * Check if budget has been exceeded.
	 */
	get isOverBudget(): boolean {
		return this.estimateCost() >= this.budgetUsd;
	}

	/**
	 * Reset the tracker (new session).
	 */
	reset(): void {
		this.totalInputTokens = 0;
		this.totalOutputTokens = 0;
	}

	private estimateCost(): number {
		const inputCost = (this.totalInputTokens / 1_000_000) * INPUT_COST_PER_M;
		const outputCost =
			(this.totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_M;
		return Math.round((inputCost + outputCost) * 10000) / 10000; // 4 decimal places
	}
}
