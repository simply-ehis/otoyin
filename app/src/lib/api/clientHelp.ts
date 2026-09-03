import { MemoryMethods } from "./clientMemory";
import type { Feature, HelpSearchResult } from "./types";

export class HelpMethods extends MemoryMethods {
	async getHelpFeatures(): Promise<{ version: number; features: Feature[] }> {
		return this.request<{ version: number; features: Feature[] }>(
			"/help/features",
		);
	}

	async searchHelp(
		query: string,
	): Promise<{ query: string; results: HelpSearchResult[] }> {
		const params = new URLSearchParams({ q: query });
		return this.request<{ query: string; results: HelpSearchResult[] }>(
			`/help/search?${params.toString()}`,
		);
	}
}
