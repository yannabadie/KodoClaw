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
	render(): string;
}

export function generateHint(milestone: Milestone, ctx: HintContext): StepHint {
	return {
		stateContext: ctx.lastAction,
		milestoneGap: `Still need to: ${milestone.goal}`,
		actionCorrection: ctx.lastError ? `Previous error: ${ctx.lastError}` : null,
		render() {
			const lines = [`State: ${this.stateContext}`, `Gap: ${this.milestoneGap}`];
			if (this.actionCorrection) lines.push(`Correction: ${this.actionCorrection}`);
			return lines.join("\n");
		},
	};
}
