// src/planning/library.ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plan } from "./planner";

interface ArchivedPlan {
	task: string;
	goals: string[];
	archivedAt: string;
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/\W+/)
		.filter((w) => w.length > 1);
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
			try {
				const raw = await readFile(join(this.dir, f), "utf-8");
				plans.push(JSON.parse(raw) as ArchivedPlan);
			} catch {
				// Skip malformed files
			}
		}
		return plans;
	}

	async findSimilar(query: string, topK = 3): Promise<ArchivedPlan[]> {
		const plans = await this.list();
		if (plans.length === 0) return [];

		const queryTerms = tokenize(query);
		if (queryTerms.length === 0) return [];

		// Build document corpus: each plan = task + all goals
		const docs = plans.map((p) => {
			const text = [p.task, ...p.goals].join(" ");
			return tokenize(text);
		});

		// IDF: log(N / df) for each term
		const N = docs.length;
		const df = new Map<string, number>();
		for (const doc of docs) {
			const unique = new Set(doc);
			for (const term of unique) {
				df.set(term, (df.get(term) ?? 0) + 1);
			}
		}

		// Score each plan
		const scored = plans.map((plan, i) => {
			const doc = docs[i] ?? [];
			let score = 0;
			for (const term of queryTerms) {
				const termFreq = doc.filter((t) => t === term).length;
				const docFreq = df.get(term) ?? 0;
				if (docFreq === 0) continue;
				const tf = termFreq / doc.length;
				const idf = Math.log((N + 1) / (docFreq + 1)) + 1;
				score += tf * idf;
			}
			return { plan, score };
		});

		return scored
			.filter((s) => s.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, topK)
			.map((s) => s.plan);
	}
}
