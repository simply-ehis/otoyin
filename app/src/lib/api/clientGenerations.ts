import type { LanguageCode } from "@/lib/constants/languages";
import { ProfilesMethods } from "./clientProfiles";
import type {
	ConversationPresets,
	EditAudioRequest,
	GenerationRequest,
	GenerationResponse,
	GenerationSettings,
	GenerationSettingsUpdate,
	HistoryListResponse,
	HistoryQuery,
	HistoryResponse,
	SFXGenerateRequest,
	MusicGenerateRequest,
	TranscriptionResponse,
	WhisperModelSize,
} from "./types";

export class GenerationsMethods extends ProfilesMethods {
	async generateSpeech(data: GenerationRequest): Promise<GenerationResponse> {
		return this.request<GenerationResponse>("/generate", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async retryGeneration(generationId: string): Promise<GenerationResponse> {
		return this.request<GenerationResponse>(`/generate/${generationId}/retry`, {
			method: "POST",
		});
	}

	async cancelGeneration(generationId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(
			`/generate/${generationId}/cancel`,
			{
				method: "POST",
			},
		);
	}

	async regenerateGeneration(
		generationId: string,
	): Promise<GenerationResponse> {
		return this.request<GenerationResponse>(
			`/generate/${generationId}/regenerate`,
			{
				method: "POST",
			},
		);
	}

	async editAudio(data: EditAudioRequest): Promise<GenerationResponse> {
		return this.request<GenerationResponse>("/generations/edit", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async importAudio(file: File, sanitize = false): Promise<GenerationResponse> {
		const form = new FormData();
		form.append("file", file);
		if (sanitize) {
			form.append("sanitize", "true");
		}
		const resp = await this.fetchWithAuth("/generate/import", {
			method: "POST",
			body: form,
		});
		return resp.json();
	}

	async generateSfx(data: SFXGenerateRequest): Promise<Blob> {
		const resp = await this.fetchWithAuth("/generate/sfx", {
			method: "POST",
			body: JSON.stringify(data),
		});
		return resp.blob();
	}

	async generateMusic(data: MusicGenerateRequest): Promise<Blob> {
		const resp = await this.fetchWithAuth("/generate/music", {
			method: "POST",
			body: JSON.stringify(data),
		});
		return resp.blob();
	}

	async toggleFavorite(
		generationId: string,
	): Promise<{ is_favorited: boolean }> {
		return this.request<{ is_favorited: boolean }>(
			`/history/${generationId}/favorite`,
			{
				method: "POST",
			},
		);
	}

	// History

	async listHistory(query?: HistoryQuery): Promise<HistoryListResponse> {
		const params = new URLSearchParams();
		if (query?.profile_id) {
			params.append("profile_id", query.profile_id);
		}
		if (query?.search) {
			params.append("search", query.search);
		}
		if (query?.limit) {
			params.append("limit", query.limit.toString());
		}
		if (query?.offset) {
			params.append("offset", query.offset.toString());
		}

		const queryString = params.toString();
		const endpoint = queryString ? `/history?${queryString}` : "/history";

		return this.request<HistoryListResponse>(endpoint);
	}

	async getGeneration(generationId: string): Promise<HistoryResponse> {
		return this.request<HistoryResponse>(`/history/${generationId}`);
	}

	async deleteGeneration(generationId: string): Promise<void> {
		await this.request<void>(`/history/${generationId}`, {
			method: "DELETE",
		});
	}

	async clearFailedGenerations(): Promise<{ deleted: number }> {
		return this.request<{ deleted: number }>(`/history/failed`, {
			method: "DELETE",
		});
	}

	async exportGeneration(generationId: string): Promise<Blob> {
		const resp = await this.fetchWithAuth(`/history/${generationId}/export`);
		return resp.blob();
	}

	async exportGenerationAudio(generationId: string): Promise<Blob> {
		const resp = await this.fetchWithAuth(`/history/${generationId}/export-audio`);
		return resp.blob();
	}

	async importGeneration(file: File): Promise<{
		id: string;
		profile_id: string;
		profile_name: string;
		text: string;
		message: string;
	}> {
		const formData = new FormData();
		formData.append("file", file);
		const resp = await this.fetchWithAuth("/history/import", {
			method: "POST",
			body: formData,
		});
		return resp.json();
	}

	// Generation status SSE

	getGenerationStatusUrl(generationId: string): string {
		return `${this.getBaseUrl()}/generate/${generationId}/status`;
	}

	// Audio

	getAudioUrl(audioId: string): string {
		return `${this.getBaseUrl()}/audio/${audioId}`;
	}

	getChunkUrl(generationId: string, chunkIndex: number): string {
		return `${this.getBaseUrl()}/generations/${generationId}/chunk/${chunkIndex}`;
	}

	getExportUrl(filename: string): string {
		return `${this.getBaseUrl()}/exports/${encodeURIComponent(filename)}`;
	}

	getSampleUrl(sampleId: string): string {
		return `${this.getBaseUrl()}/samples/${sampleId}`;
	}

	// Transcription

	async transcribeAudio(
		file: File,
		language?: LanguageCode,
		model?: WhisperModelSize,
	): Promise<TranscriptionResponse> {
		const formData = new FormData();
		formData.append("file", file);
		if (language) {
			formData.append("language", language);
		}
		if (model) {
			formData.append("model", model);
		}
		const resp = await this.fetchWithAuth("/transcribe", {
			method: "POST",
			body: formData,
		});
		return resp.json();
	}

	// Captures

	async getGenerationSettings(): Promise<GenerationSettings> {
		return this.request<GenerationSettings>("/settings/generation");
	}

	async updateGenerationSettings(
		patch: GenerationSettingsUpdate,
	): Promise<GenerationSettings> {
		return this.request<GenerationSettings>("/settings/generation", {
			method: "PUT",
			body: JSON.stringify(patch),
		});
	}

	async getWordTimestamps(generationId: string): Promise<{
		words: Array<{
			index: number;
			word: string;
			start_ms: number;
			end_ms: number;
			confidence: number;
		}>;
	}> {
		return this.request(`/transcript/${generationId}/words`);
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
		return this.request(`/transcript/${generationId}/click-word`, {
			method: "POST",
			body: JSON.stringify(word),
		});
	}

	async deleteWords(
		generationId: string,
		wordIndices: number[],
		crossfadeMs: number = 10,
	): Promise<{
		new_generation_id: string;
		new_audio_path: string;
		new_duration: number;
	}> {
		return this.request(`/transcript/${generationId}/delete-words`, {
			method: "POST",
			body: JSON.stringify({ word_indices: wordIndices, crossfade_ms: crossfadeMs }),
		});
	}

	// --- Spatial Audio ---

	async getConversationPresets(): Promise<ConversationPresets> {
		return this.request("/conversation/presets");
	}
}
