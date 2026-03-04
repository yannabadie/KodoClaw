export interface KnowledgeBinding {
	id: string;
	backend: "file_search" | "notebooklm" | "none";
	resourceId: string;
	metadataFilter?: Record<string, string>;
	topK?: number;
	citationPolicy: "always" | "on_demand" | "never";
	ttlMs?: number;
}

export function isValidBinding(v: unknown): v is KnowledgeBinding {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.id === "string" &&
		typeof obj.backend === "string" &&
		["file_search", "notebooklm", "none"].includes(obj.backend as string) &&
		typeof obj.resourceId === "string" &&
		typeof obj.citationPolicy === "string" &&
		["always", "on_demand", "never"].includes(obj.citationPolicy as string)
	);
}

export function createBinding(
	backend: KnowledgeBinding["backend"],
	resourceId: string,
	opts?: Partial<Pick<KnowledgeBinding, "metadataFilter" | "topK" | "citationPolicy" | "ttlMs">>,
): KnowledgeBinding {
	return {
		id: crypto.randomUUID(),
		backend,
		resourceId,
		citationPolicy: opts?.citationPolicy ?? "on_demand",
		metadataFilter: opts?.metadataFilter,
		topK: opts?.topK,
		ttlMs: opts?.ttlMs,
	};
}
