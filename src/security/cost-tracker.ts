/**
 * Session Cost Tracker
 *
 * Tracks token usage per session and enforces budget limits.
 * Default pricing uses Sonnet-class rates ($3/$15 per 1M tokens).
 * Configurable for Opus ($15/$75), Haiku ($1/$5), etc.
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

export interface CostConfig {
	budgetUsd?: number;
	inputCostPerM?: number;
	outputCostPerM?: number;
}

const DEFAULT_INPUT_COST_PER_M = 3;
const DEFAULT_OUTPUT_COST_PER_M = 15;
const DEFAULT_BUDGET_USD = 10;

export class CostTracker {
	private totalInputTokens = 0;
	private totalOutputTokens = 0;
	private readonly budgetUsd: number;
	private readonly inputCostPerM: number;
	private readonly outputCostPerM: number;

	constructor(config?: CostConfig | number) {
		if (typeof config === "number") {
			this.budgetUsd = config;
			this.inputCostPerM = DEFAULT_INPUT_COST_PER_M;
			this.outputCostPerM = DEFAULT_OUTPUT_COST_PER_M;
		} else {
			this.budgetUsd = config?.budgetUsd ?? DEFAULT_BUDGET_USD;
			this.inputCostPerM = config?.inputCostPerM ?? DEFAULT_INPUT_COST_PER_M;
			this.outputCostPerM = config?.outputCostPerM ?? DEFAULT_OUTPUT_COST_PER_M;
		}
	}

	record(usage: TokenUsage): void {
		this.totalInputTokens += usage.inputTokens;
		this.totalOutputTokens += usage.outputTokens;
	}

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

	get isOverBudget(): boolean {
		return this.estimateCost() >= this.budgetUsd;
	}

	reset(): void {
		this.totalInputTokens = 0;
		this.totalOutputTokens = 0;
	}

	private estimateCost(): number {
		const inputCost = (this.totalInputTokens / 1_000_000) * this.inputCostPerM;
		const outputCost = (this.totalOutputTokens / 1_000_000) * this.outputCostPerM;
		return Math.round((inputCost + outputCost) * 10000) / 10000;
	}
}
