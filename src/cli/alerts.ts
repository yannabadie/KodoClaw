// src/cli/alerts.ts
import { ANOMALY_THRESHOLDS } from "../security/audit";

export interface SessionMetrics {
  toolCallsLastMinute: number;
  consecutiveFailures: number;
  injectionAttempts: number;
  sessionCostUsd: number;
}

export function checkAnomalies(m: SessionMetrics): string[] {
  const alerts: string[] = [];

  if (m.toolCallsLastMinute >= ANOMALY_THRESHOLDS.tool_calls_per_minute) {
    alerts.push(`[KODO] ${m.toolCallsLastMinute} tool calls/min (threshold: ${ANOMALY_THRESHOLDS.tool_calls_per_minute})`);
  }
  if (m.consecutiveFailures >= ANOMALY_THRESHOLDS.failed_tool_calls) {
    alerts.push(`[KODO] ${m.consecutiveFailures} consecutive failures — circuit breaker activated`);
  }
  if (m.injectionAttempts >= ANOMALY_THRESHOLDS.injection_attempts) {
    alerts.push(`[KODO] Injection pattern detected (${m.injectionAttempts} attempts)`);
  }
  if (m.sessionCostUsd >= ANOMALY_THRESHOLDS.cost_per_session_usd) {
    alerts.push(`[KODO] Session cost: $${m.sessionCostUsd.toFixed(2)} — exceeds $${ANOMALY_THRESHOLDS.cost_per_session_usd} threshold`);
  }

  return alerts;
}
