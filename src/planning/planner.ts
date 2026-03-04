// src/planning/planner.ts
export type MilestoneStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface Subtask {
	id: number;
	label: string;
	done: boolean;
}

export interface Milestone {
	id: number;
	goal: string;
	status: MilestoneStatus;
	priority?: number;
	blockedBy?: number[];
	subtasks?: Subtask[];
}

export interface Plan {
	task: string;
	milestones: Milestone[];
	createdAt: string;
}

export interface ReplanChanges {
	add?: Array<{ goal: string; after?: number; blockedBy?: number[] }>;
	remove?: number[];
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

export function addSubtask(plan: Plan, milestoneId: number, label: string): void {
	const m = plan.milestones.find((m) => m.id === milestoneId);
	if (!m) return;
	if (!m.subtasks) m.subtasks = [];
	const nextId = m.subtasks.length > 0 ? Math.max(...m.subtasks.map((s) => s.id)) + 1 : 1;
	m.subtasks.push({ id: nextId, label, done: false });
}

export function completeSubtask(plan: Plan, milestoneId: number, subtaskId: number): void {
	const m = plan.milestones.find((m) => m.id === milestoneId);
	if (!m?.subtasks) return;
	const s = m.subtasks.find((s) => s.id === subtaskId);
	if (s) s.done = true;
}

export function getUnblockedMilestones(plan: Plan): Milestone[] {
	const isDone = (status: MilestoneStatus) => status === "completed" || status === "skipped";
	return plan.milestones
		.filter((m) => {
			if (isDone(m.status)) return false;
			if (!m.blockedBy || m.blockedBy.length === 0) return true;
			return m.blockedBy.every((depId) => {
				const dep = plan.milestones.find((d) => d.id === depId);
				return dep && isDone(dep.status);
			});
		})
		.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
}

export function replan(plan: Plan, changes: ReplanChanges): void {
	if (changes.remove) {
		const removeSet = new Set(changes.remove);
		plan.milestones = plan.milestones.filter((m) => !removeSet.has(m.id));
		for (const m of plan.milestones) {
			if (m.blockedBy) {
				m.blockedBy = m.blockedBy.filter((id) => !removeSet.has(id));
				if (m.blockedBy.length === 0) m.blockedBy = undefined;
			}
		}
	}
	if (changes.add) {
		let maxId = plan.milestones.length > 0 ? Math.max(...plan.milestones.map((m) => m.id)) : 0;
		for (const entry of changes.add) {
			maxId++;
			const newMilestone: Milestone = {
				id: maxId,
				goal: entry.goal,
				status: "pending",
				blockedBy: entry.blockedBy,
			};
			if (entry.after !== undefined) {
				const idx = plan.milestones.findIndex((m) => m.id === entry.after);
				if (idx !== -1) {
					plan.milestones.splice(idx + 1, 0, newMilestone);
				} else {
					plan.milestones.push(newMilestone);
				}
			} else {
				plan.milestones.push(newMilestone);
			}
		}
	}
}

export function renderPlanContext(plan: Plan): string {
	const active = getActiveMilestone(plan);
	if (!active) return "";
	const total = plan.milestones.length;
	const done = plan.milestones.filter((m) => m.status === "completed").length;
	return `Milestone ${active.id}/${total}: ${active.goal}\nProgress: ${done}/${total} completed`;
}
