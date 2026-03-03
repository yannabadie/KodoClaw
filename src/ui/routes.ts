// src/ui/routes.ts
export interface AppState {
	mode: string;
	autonomy: string;
	memoryCount: number;
	planProgress: { done: number; total: number } | null;
	sessionCost: number;
	dailyCost: number;
	auditEntries: unknown[];
}

interface RouteResponse {
	status: number;
	body: string;
	contentType?: string;
}

export function handleRoute(method: string, path: string, state: AppState): RouteResponse {
	if (method === "GET" && path === "/api/status") {
		return json(200, {
			mode: state.mode,
			autonomy: state.autonomy,
			memoryCount: state.memoryCount,
			planProgress: state.planProgress,
		});
	}
	if (method === "GET" && path === "/api/cost") {
		return json(200, { sessionCost: state.sessionCost, dailyCost: state.dailyCost });
	}
	if (method === "GET" && path === "/api/memory") {
		return json(200, { count: state.memoryCount });
	}
	if (method === "GET" && path === "/api/plan") {
		return json(200, { progress: state.planProgress });
	}
	if (method === "GET" && path === "/api/audit") {
		return json(200, { entries: state.auditEntries.slice(-20) });
	}
	return json(404, { error: "Not found" });
}

function json(status: number, data: unknown): RouteResponse {
	return { status, body: JSON.stringify(data), contentType: "application/json" };
}
