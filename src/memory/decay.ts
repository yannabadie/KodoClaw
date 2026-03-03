/**
 * Importance-weighted memory decay using Ebbinghaus retention curve.
 * retention(t) = e^(-(t/S)^beta)
 * where S = importance * BASE_STABILITY, beta controls decay shape.
 */

const BASE_STABILITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days base half-life
const BETA = 0.8; // Sub-linear decay (gentler than exponential)
const PRUNE_THRESHOLD = 0.1; // Below 10% retention → prune

export interface DecayConfig {
	baseStabilityMs?: number;
	beta?: number;
	pruneThreshold?: number;
}

/**
 * Compute retention score for a memory item.
 * @param timestampMs — when the memory was created (epoch ms)
 * @param nowMs — current time (epoch ms)
 * @param importance — importance weight (0.0 to 1.0+, default 1.0)
 * @returns retention score between 0.0 and 1.0
 */
export function computeRetention(
	timestampMs: number,
	nowMs: number,
	importance = 1.0,
	config?: DecayConfig,
): number {
	const elapsed = nowMs - timestampMs;
	if (elapsed <= 0) return 1.0;

	const stability = (config?.baseStabilityMs ?? BASE_STABILITY_MS) * Math.max(importance, 0.01);
	const beta = config?.beta ?? BETA;

	return Math.exp(-((elapsed / stability) ** beta));
}

/**
 * Apply decay scores to a list of items with timestamps.
 * Returns items with their retention scores, sorted by retention (highest first).
 */
export function applyDecay<T extends { timestamp: string; importance?: number }>(
	items: T[],
	nowMs?: number,
	config?: DecayConfig,
): { item: T; retention: number }[] {
	const now = nowMs ?? Date.now();
	return items
		.map((item) => ({
			item,
			retention: computeRetention(
				new Date(item.timestamp).getTime(),
				now,
				item.importance ?? 1.0,
				config,
			),
		}))
		.sort((a, b) => b.retention - a.retention);
}

/**
 * Prune items below the retention threshold.
 */
export function pruneDecayed<T extends { timestamp: string; importance?: number }>(
	items: T[],
	nowMs?: number,
	config?: DecayConfig,
): T[] {
	const threshold = config?.pruneThreshold ?? PRUNE_THRESHOLD;
	const now = nowMs ?? Date.now();
	return items.filter((item) => {
		const retention = computeRetention(
			new Date(item.timestamp).getTime(),
			now,
			item.importance ?? 1.0,
			config,
		);
		return retention >= threshold;
	});
}
