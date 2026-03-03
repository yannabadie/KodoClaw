// src/planning/planner.ts
export type MilestoneStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface Milestone {
	id: number;
	goal: string;
	status: MilestoneStatus;
}

export interface Plan {
	task: string;
	milestones: Milestone[];
	createdAt: string;
}

export function createPlan(task: string, goals: string[]): Plan {
	return {
		task,
		milestones: goals.map((goal, i) => ({ id: i + 1, goal, status: "pending" })),
		createdAt: new Date().toISOString(),
	};
}

export function getActiveMilestone(plan: Plan): Milestone | null {
	return plan.milestones.find((m) => m.status === "pending" || m.status === "in_progress") ?? null;
}

export function updateMilestone(plan: Plan, id: number, status: MilestoneStatus): void {
	const m = plan.milestones.find((m) => m.id === id);
	if (m) m.status = status;
}

export function isPlanComplete(plan: Plan): boolean {
	return plan.milestones.every((m) => m.status === "completed" || m.status === "skipped");
}

export function renderPlanContext(plan: Plan): string {
	const active = getActiveMilestone(plan);
	if (!active) return "";
	const total = plan.milestones.length;
	const done = plan.milestones.filter((m) => m.status === "completed").length;
	return `Milestone ${active.id}/${total}: ${active.goal}\nProgress: ${done}/${total} completed`;
}
