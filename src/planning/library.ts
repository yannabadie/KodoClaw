// src/planning/library.ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plan } from "./planner";

interface ArchivedPlan {
	task: string;
	goals: string[];
	archivedAt: string;
}

export class MilestoneLibrary {
	constructor(private readonly dir: string) {}

	async archive(plan: Plan): Promise<void> {
		await mkdir(this.dir, { recursive: true });
		const entry: ArchivedPlan = {
			task: plan.task,
			goals: plan.milestones.map((m) => m.goal),
			archivedAt: new Date().toISOString(),
		};
		const id = `plan_${Date.now().toString(36)}`;
		await writeFile(join(this.dir, `${id}.json`), JSON.stringify(entry, null, 2), "utf-8");
	}

	async list(): Promise<ArchivedPlan[]> {
		const files = await readdir(this.dir).catch(() => [] as string[]);
		const plans: ArchivedPlan[] = [];
		for (const f of files) {
			if (!f.endsWith(".json")) continue;
			const raw = await readFile(join(this.dir, f), "utf-8");
			plans.push(JSON.parse(raw));
		}
		return plans;
	}

	async findSimilar(query: string, topK = 3): Promise<ArchivedPlan[]> {
		const plans = await this.list();
		const queryWords = new Set(query.toLowerCase().split(/\W+/));
		const scored = plans.map((p) => {
			const taskWords = p.task.toLowerCase().split(/\W+/);
			const overlap = taskWords.filter((w) => queryWords.has(w)).length;
			return { plan: p, score: overlap };
		});
		return scored
			.filter((s) => s.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, topK)
			.map((s) => s.plan);
	}
}
