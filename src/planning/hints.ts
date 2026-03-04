// src/planning/hints.ts
import type { Milestone } from "./planner";

export interface HintContext {
	lastAction: string;
	lastError: string | null;
}

export interface StepHint {
	stateContext: string;
	milestoneGap: string;
	actionCorrection: string | null;
	subtaskProgress: string | null;
	render(): string;
}

export function generateHint(milestone: Milestone, ctx: HintContext): StepHint {
	let subtaskProgress: string | null = null;
	if (milestone.subtasks && milestone.subtasks.length > 0) {
		const done = milestone.subtasks.filter((s) => s.done).length;
		const total = milestone.subtasks.length;
		const next = milestone.subtasks.find((s) => !s.done);
		subtaskProgress = `Subtasks: ${done}/${total} done`;
		if (next) subtaskProgress += ` — Next: ${next.label}`;
	}

	return {
		stateContext: ctx.lastAction,
		milestoneGap: `Still need to: ${milestone.goal}`,
		actionCorrection: ctx.lastError ? `Previous error: ${ctx.lastError}` : null,
		subtaskProgress,
		render() {
			const lines = [`State: ${this.stateContext}`, `Gap: ${this.milestoneGap}`];
			if (this.subtaskProgress) lines.push(this.subtaskProgress);
			if (this.actionCorrection) lines.push(`Correction: ${this.actionCorrection}`);
			return lines.join("\n");
		},
	};
}
