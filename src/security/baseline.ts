/**
 * Behavioral Baseline Tracker
 *
 * Tracks behavioral patterns per session and detects anomalies
 * by comparing current behavior against rolling baselines.
 *
 * Tracked metrics:
 * - Tool call frequency per tool type
 * - Sensitive file access count
 * - Shell command risk distribution
 * - Injection detection frequency
 */

export interface BehaviorEvent {
	tool: string;
	sensitive: boolean;
	riskLevel: "low" | "medium" | "high" | "critical";
	injectionScore: number;
	timestamp: number;
}

export interface AnomalyReport {
	anomalies: Anomaly[];
	isNormal: boolean;
	shouldTerminate: boolean;
}

export interface Anomaly {
	type: "tool_frequency_spike" | "sensitive_access_spike" | "high_risk_spike" | "injection_spike";
	message: string;
	currentValue: number;
	threshold: number;
}

// Thresholds for anomaly detection (per-window)
const ANOMALY_CONFIG = {
	/** Max tool calls in a 5-minute window before flagging */
	toolCallsPerWindow: 50,
	/** Max sensitive file accesses in a 5-minute window */
	sensitiveAccessPerWindow: 5,
	/** Max high/critical risk commands in a 5-minute window */
	highRiskPerWindow: 3,
	/** Max injection detections in a 5-minute window */
	injectionPerWindow: 2,
	/** Window size in ms */
	windowMs: 5 * 60 * 1000,
} as const;

export class BehaviorBaseline {
	private events: BehaviorEvent[] = [];

	/**
	 * Record a behavioral event.
	 */
	record(event: BehaviorEvent): void {
		this.events.push(event);
	}

	/**
	 * Analyze current behavior for anomalies within the recent window.
	 */
	analyze(): AnomalyReport {
		const now = Date.now();
		const cutoff = now - ANOMALY_CONFIG.windowMs;
		const recent = this.events.filter((e) => e.timestamp >= cutoff);

		const anomalies: Anomaly[] = [];

		// Check tool call frequency
		if (recent.length > ANOMALY_CONFIG.toolCallsPerWindow) {
			anomalies.push({
				type: "tool_frequency_spike",
				message: `${recent.length} tool calls in last 5 minutes (threshold: ${ANOMALY_CONFIG.toolCallsPerWindow})`,
				currentValue: recent.length,
				threshold: ANOMALY_CONFIG.toolCallsPerWindow,
			});
		}

		// Check sensitive access frequency
		const sensitiveCount = recent.filter((e) => e.sensitive).length;
		if (sensitiveCount > ANOMALY_CONFIG.sensitiveAccessPerWindow) {
			anomalies.push({
				type: "sensitive_access_spike",
				message: `${sensitiveCount} sensitive file accesses in last 5 minutes (threshold: ${ANOMALY_CONFIG.sensitiveAccessPerWindow})`,
				currentValue: sensitiveCount,
				threshold: ANOMALY_CONFIG.sensitiveAccessPerWindow,
			});
		}

		// Check high-risk command frequency
		const highRiskCount = recent.filter(
			(e) => e.riskLevel === "high" || e.riskLevel === "critical",
		).length;
		if (highRiskCount > ANOMALY_CONFIG.highRiskPerWindow) {
			anomalies.push({
				type: "high_risk_spike",
				message: `${highRiskCount} high/critical risk commands in last 5 minutes (threshold: ${ANOMALY_CONFIG.highRiskPerWindow})`,
				currentValue: highRiskCount,
				threshold: ANOMALY_CONFIG.highRiskPerWindow,
			});
		}

		// Check injection detection frequency
		const injectionCount = recent.filter((e) => e.injectionScore > 0).length;
		if (injectionCount > ANOMALY_CONFIG.injectionPerWindow) {
			anomalies.push({
				type: "injection_spike",
				message: `${injectionCount} injection detections in last 5 minutes (threshold: ${ANOMALY_CONFIG.injectionPerWindow})`,
				currentValue: injectionCount,
				threshold: ANOMALY_CONFIG.injectionPerWindow,
			});
		}

		const criticalMultiplier = 2;
		const shouldTerminate = anomalies.some(a => a.currentValue >= a.threshold * criticalMultiplier);

		return {
			anomalies,
			isNormal: anomalies.length === 0,
			shouldTerminate,
		};
	}

	/**
	 * Get the current event count (within window).
	 */
	get recentCount(): number {
		const cutoff = Date.now() - ANOMALY_CONFIG.windowMs;
		return this.events.filter((e) => e.timestamp >= cutoff).length;
	}

	/**
	 * Reset all recorded events.
	 */
	reset(): void {
		this.events = [];
	}
}
