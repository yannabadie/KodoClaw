import type { KnowledgeBinding } from "./binding";

export interface AgentInstance {
	id: string;
	templateSlug: string;
	binding: KnowledgeBinding | null;
	name: string;
	createdAt: string;
	ttlMs?: number;
	owner?: string;
}

export function createInstance(
	templateSlug: string,
	name: string,
	binding?: KnowledgeBinding | null,
	ttlMs?: number,
): AgentInstance {
	return {
		id: crypto.randomUUID(),
		templateSlug,
		binding: binding ?? null,
		name,
		createdAt: new Date().toISOString(),
		ttlMs,
	};
}

export function isExpired(instance: AgentInstance): boolean {
	if (!instance.ttlMs) return false;
	const age = Date.now() - new Date(instance.createdAt).getTime();
	return age > instance.ttlMs;
}
