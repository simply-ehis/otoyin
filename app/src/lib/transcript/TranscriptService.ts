import { apiClient } from "@/lib/api/client";

export interface WordTimestamp {
	index: number;
	word: string;
	start_ms: number;
	end_ms: number;
	confidence: number;
	selected: boolean;
}

class TranscriptService {
	private cache = new Map<string, WordTimestamp[]>();
	private loading = new Map<string, Promise<WordTimestamp[]> | null>();

	async fetchWords(generationId: string): Promise<WordTimestamp[]> {
		if (this.cache.has(generationId)) {
			const cached = this.cache.get(generationId);
			if (cached) {
				return cached;
			}
		}

		if (this.loading.has(generationId)) {
			const loadingPromise = this.loading.get(generationId);
			if (loadingPromise) {
				return loadingPromise;
			}
		}

		const promise = this._fetchWords(generationId);
		this.loading.set(generationId, promise);

		try {
			const words = await promise;
			this.cache.set(generationId, words);
			return words;
		} finally {
			this.loading.delete(generationId);
		}
	}

	private async _fetchWords(generationId: string): Promise<WordTimestamp[]> {
		const res = await apiClient.getWordTimestamps(generationId);
		return res.words.map((w, i) => ({
			index: i,
			word: w.word,
			start_ms: w.start_ms,
			end_ms: w.end_ms,
			confidence: w.confidence ?? 1.0,
			selected: false,
		}));
	}

	async clickWord(
		generationId: string,
		word: { index: number; word: string; start_ms: number; end_ms: number },
	): Promise<{
		playhead_ms: number;
		select_start_ms: number;
		select_end_ms: number;
		word: string;
	}> {
		return apiClient.clickWord(generationId, word);
	}

	async deleteWords(
		generationId: string,
		wordIndices: number[],
		crossfadeMs = 10,
	): Promise<{
		new_generation_id: string;
		new_audio_path: string;
		new_duration: number;
	}> {
		const result = await apiClient.deleteWords(
			generationId,
			wordIndices,
			crossfadeMs,
		);
		this.invalidate(generationId);
		return result;
	}

	invalidate(generationId: string): void {
		this.cache.delete(generationId);
	}

	getCached(generationId: string): WordTimestamp[] | undefined {
		return this.cache.get(generationId);
	}
}

export const transcriptService = new TranscriptService();
