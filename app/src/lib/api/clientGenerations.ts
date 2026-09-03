import type { LanguageCode } from "@/lib/constants/languages";
import { formatErrorDetail } from "./clientCore";
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
		const res = await fetch(`${this.getBaseUrl()}/generate/import`, {
			method: "POST",
			body: form,
		});
		if (!res.ok) {
			const detail = await res.text().catch(() => res.statusText);
			throw new Error(detail || `HTTP ${res.status}`);
		}
		return res.json();
	}

	async generateSfx(data: SFXGenerateRequest): Promise<Blob> {
		const res = await fetch(`${this.getBaseUrl()}/generate/sfx`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
		if (!res.ok) {
			const error = await res.json().catch(() => ({ detail: res.statusText }));
			throw new Error(formatErrorDetail(error.detail, `HTTP error! status: ${res.status}`));
		}
		return res.blob();
	}

	async generateMusic(data: { engine: string; prompt: string; duration_seconds: number; genre?: string; mood?: string; tempo?: number; seed?: number }): Promise<Blob> {
		const res = await fetch(`${this.getBaseUrl()}/generate/music`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
		if (!res.ok) {
			const error = await res.json().catch(() => ({ detail: res.statusText }));
			throw new Error(formatErrorDetail(error.detail, `HTTP error! status: ${res.status}`));
		}
		return res.blob();
	}

	async searchFreesound(q: string, page = 1, pageSize = 20): Promise<{ results: Array<{ id: number; name: string; username: string; license: string; duration: number; previews: { "preview-hq-ogg": string; "preview-lq-ogg": string }; tags: string[] }>; count: number; next?: string }> {
		return this.request(`/sounds/search?q=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`);
	}

	async downloadFreesound(soundId: number | string, previewUrl: string): Promise<{ sound_id: string; path: string; cached: boolean }> {
		return this.request(`/sounds/download/${soundId}`, {
			method: "POST",
			body: JSON.stringify({ preview_url: previewUrl }),
		});
	}

	async getTelemetryStatus(): Promise<{ enabled: boolean }> {
		return this.request("/telemetry/status");
	}

	async toggleTelemetry(enabled: boolean): Promise<{ enabled: boolean; message: string }> {
		return this.request("/telemetry/toggle", { method: "POST", body: JSON.stringify({ enabled }) });
	}

	async getTelemetrySummary(): Promise<{ total_events: number; active_days: number; event_counts: Record<string, number> }> {
		return this.request("/telemetry/summary");
	}

	async getTelemetryTimeline(params: { since?: string; bucket?: string }): Promise<{ timeline: Array<{ bucket: string; count: number }> }> {
		const sp = new URLSearchParams();
		if (params.since) sp.set("since", params.since);
		if (params.bucket) sp.set("bucket", params.bucket);
		const qs = sp.toString();
		return this.request(`/telemetry/timeline${qs ? `?${qs}` : ""}`);
	}

	async getTelemetryEvents(params: { since?: string; limit?: number; event_type?: string }): Promise<{ events: Array<{ name: string; properties: Record<string, unknown>; timestamp: string }>; total: number }> {
		const sp = new URLSearchParams();
		if (params.since) sp.set("since", params.since);
		if (params.limit) sp.set("limit", String(params.limit));
		if (params.event_type) sp.set("event_type", params.event_type);
		const qs = sp.toString();
		return this.request(`/telemetry/events${qs ? `?${qs}` : ""}`);
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
		const url = `${this.getBaseUrl()}/history/${generationId}/export`;
		const response = await fetch(url);

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}

		return response.blob();
	}

	async exportGenerationAudio(generationId: string): Promise<Blob> {
		const url = `${this.getBaseUrl()}/history/${generationId}/export-audio`;
		const response = await fetch(url);

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}

		return response.blob();
	}

	async importGeneration(file: File): Promise<{
		id: string;
		profile_id: string;
		profile_name: string;
		text: string;
		message: string;
	}> {
		const url = `${this.getBaseUrl()}/history/import`;
		const formData = new FormData();
		formData.append("file", file);

		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}

		return response.json();
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

		const url = `${this.getBaseUrl()}/transcribe`;
		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				detail: response.statusText,
			}));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}

		return response.json();
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
