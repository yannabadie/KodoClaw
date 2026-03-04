import type { BaseMode } from "../modes/base-mode";
import type { AgentTemplate } from "./template";

export function modeToTemplate(mode: BaseMode): AgentTemplate {
	return {
		name: mode.name,
		slug: mode.slug,
		description: `${mode.name} mode — ${mode.autonomyLevel} autonomy`,
		tools: [...mode.allowedTools],
		instructions: mode.instructions,
		autonomyLevel: mode.autonomyLevel,
		memoryDepth: mode.memoryDepth,
		planningEnabled: mode.planningEnabled,
	};
}
