import type { RAGResponse } from "./connector";

export interface FileSearchConfig {
	apiKey: string;
	storeNames: string[];
	metadataFilter?: Record<string, string>;
	topK?: number;
	model?: string;
}

export async function queryFileSearch(
	question: string,
	config: FileSearchConfig,
): Promise<RAGResponse> {
	const model = config.model ?? "gemini-2.0-flash";
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

	const body: Record<string, unknown> = {
		contents: [{ parts: [{ text: question }] }],
		tools: [
			{
				file_search: {
					file_search_store_names: config.storeNames,
					...(config.metadataFilter ? { dynamic_metadata_filter: config.metadataFilter } : {}),
				},
			},
		],
		generationConfig: {
			temperature: 0.2,
			maxOutputTokens: 1024,
		},
	};

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Gemini File Search failed (${response.status}): ${text}`);
	}

	const json = (await response.json()) as Record<string, unknown>;
	return parseGeminiResponse(json);
}

export function parseGeminiResponse(json: Record<string, unknown>): RAGResponse {
	const candidates = json.candidates as Array<Record<string, unknown>> | undefined;
	const first = candidates?.[0];
	const content = first?.content as Record<string, unknown> | undefined;
	const parts = content?.parts as Array<Record<string, unknown>> | undefined;
	const text = (parts?.[0]?.text ?? "") as string;

	const groundingMetadata = first?.groundingMetadata as Record<string, unknown> | undefined;
	const chunks = groundingMetadata?.groundingChunks as Array<Record<string, unknown>> | undefined;
	const sources: string[] = [];
	if (Array.isArray(chunks)) {
		for (const chunk of chunks) {
			const web = chunk?.web as Record<string, unknown> | undefined;
			if (typeof web?.uri === "string") {
				sources.push(web.uri);
			}
			const retrievedContext = chunk?.retrievedContext as Record<string, unknown> | undefined;
			if (typeof retrievedContext?.uri === "string") {
				sources.push(retrievedContext.uri);
			}
		}
	}

	return { answer: text, sources, confidence: sources.length > 0 ? 0.8 : 0.5 };
}
