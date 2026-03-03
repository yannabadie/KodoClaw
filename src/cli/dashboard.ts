// src/cli/dashboard.ts
export interface DashboardData {
	mode: string;
	autonomy: string;
	memoryCount: number;
	planProgress: { done: number; total: number } | null;
	sessionCost: number;
	dailyCost: number;
}

export function renderDashboard(data: DashboardData): string {
	const parts = [`${data.mode} (${data.autonomy})`];
	parts.push(`${data.memoryCount} memories`);
	if (data.planProgress) {
		parts.push(`plan: ${data.planProgress.done}/${data.planProgress.total} done`);
	}

	const costLine = `cost: $${data.sessionCost.toFixed(2)} session  |  $${data.dailyCost.toFixed(2)} today`;

	const inner = parts.join("  |  ");
	const width = Math.max(inner.length, costLine.length) + 4;
	const border = "-".repeat(width);

	return [
		`+-- Kodo ${border}+`,
		`| ${inner.padEnd(width)} |`,
		`| ${costLine.padEnd(width)} |`,
		`+${"-".repeat(width + 2)}+`,
	].join("\n");
}
