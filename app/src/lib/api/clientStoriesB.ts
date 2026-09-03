import type { AudioStudioSnapshot } from "@/components/AudioStudio/AudioStudioStore";
import { formatErrorDetail } from "./clientCore";
import { StoriesAMethods } from "./clientStoriesA";
import type {
	ApplyEffectsRequest,
	AvailableEffectsResponse,
	EffectConfig,
	EffectPresetCreate,
	EffectPresetResponse,
	ExportPresets,
	GenerationVersionResponse,
	SessionResponse,
} from "./types";

export class StoriesBMethods extends StoriesAMethods {
	async getAvailableEffects(): Promise<AvailableEffectsResponse> {
		return this.request<AvailableEffectsResponse>("/effects/available");
	}

	async listEffectPresets(): Promise<EffectPresetResponse[]> {
		return this.request<EffectPresetResponse[]>("/effects/presets");
	}

	async createEffectPreset(
		data: EffectPresetCreate,
	): Promise<EffectPresetResponse> {
		return this.request<EffectPresetResponse>("/effects/presets", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async updateEffectPreset(
		presetId: string,
		data: {
			name?: string;
			description?: string;
			effects_chain?: EffectConfig[];
		},
	): Promise<EffectPresetResponse> {
		return this.request<EffectPresetResponse>(`/effects/presets/${presetId}`, {
			method: "PUT",
			body: JSON.stringify(data),
		});
	}

	async deleteEffectPreset(presetId: string): Promise<void> {
		await this.request<void>(`/effects/presets/${presetId}`, {
			method: "DELETE",
		});
	}

	async listGenerationVersions(
		generationId: string,
	): Promise<GenerationVersionResponse[]> {
		return this.request<GenerationVersionResponse[]>(
			`/generations/${generationId}/versions`,
		);
	}

	async applyEffectsToGeneration(
		generationId: string,
		data: ApplyEffectsRequest,
	): Promise<GenerationVersionResponse> {
		return this.request<GenerationVersionResponse>(
			`/generations/${generationId}/versions/apply-effects`,
			{
				method: "POST",
				body: JSON.stringify(data),
			},
		);
	}

	async setDefaultVersion(
		generationId: string,
		versionId: string,
	): Promise<GenerationVersionResponse> {
		return this.request<GenerationVersionResponse>(
			`/generations/${generationId}/versions/${versionId}/set-default`,
			{ method: "PUT" },
		);
	}

	async deleteGenerationVersion(
		generationId: string,
		versionId: string,
	): Promise<void> {
		await this.request<void>(
			`/generations/${generationId}/versions/${versionId}`,
			{
				method: "DELETE",
			},
		);
	}

	getVersionAudioUrl(versionId: string): string {
		return `${this.getBaseUrl()}/audio/version/${versionId}`;
	}

	async previewEffects(
		generationId: string,
		effectsChain: EffectConfig[],
	): Promise<Blob> {
		const url = `${this.getBaseUrl()}/effects/preview/${generationId}`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ effects_chain: effectsChain }),
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

		return response.blob();
	}

	// --- Phase 2: Standalone Project ---

	async listBatchJobs() {
		const response = await this.fetchWithAuth("/batch/jobs");
		return response.json();
	}

	async createBatchJob(
		name: string,
		funcName: string,
		funcArgs: Record<string, unknown> = {},
	) {
		const response = await this.fetchWithAuth("/batch/jobs", {
			method: "POST",
			body: JSON.stringify({ name, func_name: funcName, func_args: funcArgs }),
		});
		return response.json();
	}

	async getBatchJob(jobId: string) {
		const response = await this.fetchWithAuth(`/batch/jobs/${jobId}`);
		return response.json();
	}

	async cancelBatchJob(jobId: string) {
		const response = await this.fetchWithAuth(`/batch/jobs/${jobId}/cancel`, {
			method: "POST",
		});
		return response.json();
	}

	// --- Audio Studio ---

	async bounceTracks(data: {
		tracks: Array<{
			audio_data?: string;
			midi_notes?: number[];
			instrument?: string;
			note_duration?: number;
			volume?: number;
			pan?: number;
			muted?: boolean;
			solo?: boolean;
			plugin_chain?: Array<{
				plugin_id: string;
				plugin_name?: string;
				enabled?: boolean;
				params?: Record<string, number>;
			}>;
			volume_automation?: Array<{ time: number; value: number }>;
			pan_automation?: Array<{ time: number; value: number }>;
			crossfade_target?: number | null;
			crossfade_ms?: number;
			channels?: number;
		}>;
		sample_rate?: number;
		master_volume?: number;
	}): Promise<Blob> {
		const url = `${this.getBaseUrl()}/audio/bounce`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.blob();
	}

	async getExportPresets(): Promise<ExportPresets> {
		return this.request("/export/presets");
	}

	async applyExportPreset(
		presetName: string,
		audioPath: string,
		cleanup = false,
	): Promise<Blob> {
		const url = `${this.getBaseUrl()}/export/apply-preset`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ preset_name: presetName, audio_path: audioPath, cleanup }),
		});
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.blob();
	}

	async runRecipe(
		segments: Array<{
			audio_path: string;
			effects?: Array<{ type: string; params?: Record<string, unknown> }>;
		}>,
		recipe: string = "podcast",
		musicPath?: string,
		targetLufs?: number,
		truePeakDb?: number,
		gapMs?: number,
	): Promise<{
		output_path: string;
		filename: string;
		recipe: string;
		target_lufs: number;
		integrated_lufs: number;
		sample_rate: number;
		duration_seconds: number;
	}> {
		const url = `${this.getBaseUrl()}/recipe/run`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				segments,
				recipe,
				music_path: musicPath,
				target_lufs: targetLufs,
				true_peak_db: truePeakDb,
				gap_ms: gapMs,
			}),
		});
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.json();
	}

	async analyzeLoudness(audioPath: string): Promise<{
		integrated_lufs: number;
		true_peak_db: number;
		rms_db: number;
		crest_db: number;
		lra_lufs: number;
	}> {
		const url = `${this.getBaseUrl()}/audio/analyze-loudness`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ audio_path: audioPath }),
		});
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.json();
	}

	// --- Transcript-Driven Editing ---

	async listAudioStudioSessions(): Promise<
		Array<{
			id: string;
			name: string;
			data: AudioStudioSnapshot;
			created_at: string;
			updated_at: string;
		}>
	> {
		return this.request("/audio-studio/sessions");
	}

	async getAudioStudioSession(sessionId: string): Promise<{
		id: string;
		name: string;
		data: AudioStudioSnapshot;
		created_at: string;
		updated_at: string;
	}> {
		return this.request(`/audio-studio/sessions/${sessionId}`);
	}

	async saveAudioStudioSession(
		name: string,
		data: AudioStudioSnapshot,
	): Promise<{
		id: string;
		name: string;
		data: AudioStudioSnapshot;
		created_at: string;
		updated_at: string;
	}> {
		return this.request("/audio-studio/sessions", {
			method: "POST",
			body: JSON.stringify({ name, data }),
		});
	}

	async updateAudioStudioSession(
		sessionId: string,
		name?: string,
		data?: AudioStudioSnapshot,
	): Promise<{
		id: string;
		name: string;
		data: AudioStudioSnapshot;
		created_at: string;
		updated_at: string;
	}> {
		return this.request(`/audio-studio/sessions/${sessionId}`, {
			method: "PUT",
			body: JSON.stringify({ name, data }),
		});
	}

	async promoteAudioStudioSession(
		sessionId: string,
		name: string,
		data?: AudioStudioSnapshot,
	): Promise<{
		id: string;
		name: string;
		data: AudioStudioSnapshot;
		created_at: string;
		updated_at: string;
	}> {
		return this.request(`/audio-studio/sessions/${sessionId}/promote`, {
			method: "POST",
			body: JSON.stringify({ name, data }),
		});
	}

	async deleteAudioStudioSession(
		sessionId: string,
	): Promise<{ deleted: string }> {
		return this.request(`/audio-studio/sessions/${sessionId}`, {
			method: "DELETE",
		});
	}

	// --- Rolling autosave snapshots (5-slot undo stack) ---

	async createAutosaveSnapshot(
		sessionId: string,
		data: unknown,
		kind: string = "studio",
	): Promise<{
		id: string;
		session_id: string;
		data: unknown;
		kind: string;
		created_at: string;
	}> {
		return this.request(`/audio-studio/sessions/${sessionId}/autosave-snapshot`, {
			method: "POST",
			body: JSON.stringify({ name: kind, data }),
		});
	}

	async listAutosaveSnapshots(
		sessionId: string,
	): Promise<{
		id: string;
		session_id: string;
		data: unknown;
		kind: string;
		created_at: string;
	}[]> {
		return this.request(`/audio-studio/sessions/${sessionId}/autosave-snapshots`);
	}

	async undoAutosave(
		sessionId: string,
	): Promise<{
		id: string;
		name: string;
		data: unknown;
		is_autosave: boolean;
		created_at: string;
		updated_at: string;
	}> {
		return this.request(`/audio-studio/sessions/${sessionId}/undo-autosave`, {
			method: "POST",
		});
	}

	// --- Noise Reduction ---

	async noiseReduce(
		audioPath: string,
		vadThreshold: number = 0.5,
	): Promise<Blob> {
		const url = `${this.getBaseUrl()}/audio/noise-reduce`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				audio_path: audioPath,
				vad_threshold: vadThreshold,
			}),
		});
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.blob();
	}

	async audioEnhance(
		audioPath: string,
		mode: "auto" | "lavasr" | "denoise" = "auto",
	): Promise<Blob> {
		const url = `${this.getBaseUrl()}/audio/enhance`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				audio_path: audioPath,
				mode,
			}),
		});
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.blob();
	}

	async separateAudio(
		audioPath: string,
		stem: "vocals" | "drums" | "bass" | "other" = "vocals",
		modelName: string = "htdemucs",
	): Promise<Blob> {
		const url = `${this.getBaseUrl()}/audio/separate`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				audio_path: audioPath,
				stem,
				model_name: modelName,
			}),
		});
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.blob();
	}

	// --- Voice Clean A/B Comparison ---

	async voiceCleanAB(
		audioPath: string,
		options?: { engine?: string; strength?: number },
	): Promise<{
		sample_rate: number;
		preset: string;
		display_engine: string | null;
		original_b64: string;
		enhanced_b64: string;
	}> {
		return this.request(`/audio/voice-clean/ab`, {
			method: "POST",
			body: JSON.stringify({
				audio_path: audioPath,
				engine: options?.engine ?? null,
				strength: options?.strength ?? 1.0,
			}),
		});
	}

	// --- Conversation / Podcast / Debate Mode ---

	async autoDuckSpeakers(
		lines: Array<{
			id: string;
			text: string;
			speaker: string;
			engine?: string;
			profile_id?: string;
			start_mode?: string;
			start_offset_ms?: number;
			overlap_ms?: number;
			track?: number;
		}>,
	): Promise<{ gains: number[] }> {
		return this.request("/conversation/auto-duck", {
			method: "POST",
			body: JSON.stringify(lines),
		});
	}

	async autoLevelMatch(
		lines: Array<{
			id: string;
			text: string;
			speaker: string;
			engine?: string;
			profile_id?: string;
			start_mode?: string;
			start_offset_ms?: number;
			overlap_ms?: number;
			track?: number;
		}>,
	): Promise<{ target_lufs: number[] }> {
		return this.request("/conversation/auto-level", {
			method: "POST",
			body: JSON.stringify(lines),
		});
	}

	// --- Platform Export Presets ---

	async assembleComp(
		segments: Array<{
			start_ms: number;
			end_ms: number;
			audio_base64?: string;
			tone_hz?: number;
		}>,
		opts?: { sample_rate?: number; crossfade_ms?: number },
	): Promise<Blob> {
		const url = `${this.getBaseUrl()}/comping/assemble`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				segments,
				sample_rate: opts?.sample_rate ?? 22050,
				crossfade_ms: opts?.crossfade_ms ?? 0,
			}),
		});
		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ detail: response.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${response.status}`,
				),
			);
		}
		return response.blob();
	}

	// --- Comping / Mixer session persistence (autosave + explicit Save) ---

	async createCompingSession(name: string, data: unknown, isAutosave = false) {
		return this.request<SessionResponse>("/comping/sessions", {
			method: "POST",
			body: JSON.stringify({ name, data, is_autosave: isAutosave }),
		});
	}

	async updateCompingSession(id: string, data: unknown) {
		return this.request<SessionResponse>(`/comping/sessions/${id}`, {
			method: "PUT",
			body: JSON.stringify({ data }),
		});
	}

	async promoteCompingSession(id: string, name: string, data: unknown) {
		return this.request<SessionResponse>(`/comping/sessions/${id}/promote`, {
			method: "POST",
			body: JSON.stringify({ name, data }),
		});
	}

	async createMixerSession(name: string, data: unknown, isAutosave = false) {
		return this.request<SessionResponse>("/mixer/sessions", {
			method: "POST",
			body: JSON.stringify({ name, data, is_autosave: isAutosave }),
		});
	}

	async updateMixerSession(id: string, data: unknown) {
		return this.request<SessionResponse>(`/mixer/sessions/${id}`, {
			method: "PUT",
			body: JSON.stringify({ data }),
		});
	}

	async promoteMixerSession(id: string, name: string, data: unknown) {
		return this.request<SessionResponse>(`/mixer/sessions/${id}/promote`, {
			method: "POST",
			body: JSON.stringify({ name, data }),
		});
	}

	// --- Comping snapshot undo ---

	async createCompingAutosaveSnapshot(id: string, data: unknown) {
		return this.request(`/comping/sessions/${id}/autosave-snapshot`, {
			method: "POST",
			body: JSON.stringify({ name: "comp", data }),
		});
	}

	async undoCompingAutosave(id: string): Promise<SessionResponse> {
		return this.request(`/comping/sessions/${id}/undo-autosave`, {
			method: "POST",
		});
	}

	// --- Mixer snapshot undo ---

	async createMixerAutosaveSnapshot(id: string, data: unknown) {
		return this.request(`/mixer/sessions/${id}/autosave-snapshot`, {
			method: "POST",
			body: JSON.stringify({ name: "mixer", data }),
		});
	}

	async undoMixerAutosave(id: string): Promise<SessionResponse> {
		return this.request(`/mixer/sessions/${id}/undo-autosave`, {
			method: "POST",
		});
	}

	// --- Assistant ---

	async createProject(
		name: string,
		description: string,
		fps: number,
		sampleRate: number,
	) {
		const response = await this.fetchWithAuth("/project/create", {
			method: "POST",
			body: JSON.stringify({ name, description, fps, sample_rate: sampleRate }),
		});
		return response.json();
	}

	async saveProject(projectId: string, projectJson: string) {
		const response = await this.fetchWithAuth("/project/save", {
			method: "POST",
			body: JSON.stringify({
				project_id: projectId,
				project_json: projectJson,
			}),
		});
		return response.json();
	}

	async loadProject(projectId: string) {
		const response = await this.fetchWithAuth("/project/load", {
			method: "POST",
			body: JSON.stringify({ project_id: projectId }),
		});
		return response.json();
	}

	async importScript(
		projectId: string,
		text: string,
		format: "plain" | "fountain",
	) {
		const response = await this.fetchWithAuth("/project/import-script", {
			method: "POST",
			body: JSON.stringify({ project_id: projectId, text, format }),
		});
		return response.json();
	}

	async listProjectTemplates() {
		const response = await this.fetchWithAuth("/project/templates");
		return response.json();
	}

	// --- Phase 2: Extended Import ---

	// --- YouTube / URL Download ---

	async getYoutubeInfo(url: string) {
		return this.request<{
			title: string;
			duration: number;
			thumbnail: string;
			uploader: string;
		}>("/youtube/info", { method: "POST", body: JSON.stringify({ url }) });
	}

	async startYoutubeDownload(
		url: string,
		outputFormat: string,
		audioFormat: string,
	) {
		return this.request<{
			task_id: string;
			file_path: string;
			title: string;
			duration: number;
			thumbnail: string;
			uploader: string;
		}>("/youtube/download", {
			method: "POST",
			body: JSON.stringify({
				url,
				output_format: outputFormat,
				audio_format: audioFormat,
			}),
		});
	}

	async getYoutubeProgress(taskId: string) {
		return this.request<{
			task_id: string;
			status: string;
			percent: number;
			speed: string;
			eta: string;
			error: string;
		}>(`/youtube/progress/${taskId}`);
	}

	async getYoutubeFile(taskId: string): Promise<Blob> {
		const url = `${this.getBaseUrl()}/youtube/file/${taskId}`;
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch YouTube file: ${response.status}`);
		}
		return response.blob();
	}

	// --- Translation ---

	async translateText(text: string, sourceLang = "auto", targetLang = "en") {
		return this.request<{
			translated_text: string;
			source_lang: string;
			detected_lang: string;
		}>("/translate", {
			method: "POST",
			body: JSON.stringify({
				text,
				source_lang: sourceLang,
				target_lang: targetLang,
			}),
		});
	}

	async translateBatch(
		texts: string[],
		sourceLang = "auto",
		targetLang = "en",
	) {
		return this.request<{
			results: Array<{
				translated_text: string;
				source_lang: string;
				detected_lang: string;
			}>;
		}>("/translate/batch", {
			method: "POST",
			body: JSON.stringify({
				texts,
				source_lang: sourceLang,
				target_lang: targetLang,
			}),
		});
	}

	async getTranslateLanguages() {
		return this.request<{ languages: Record<string, string> }>(
			"/translate/languages",
		);
	}

	// --- Reference Voices ---

	async getReferenceVoices(language?: string, category?: string) {
		const params = new URLSearchParams();
		if (language) {
			params.set("language", language);
		}
		if (category) {
			params.set("category", category);
		}
		const qs = params.toString();
		return this.request<{
			voices: Array<{
				id: string;
				name: string;
				language: string;
				category: string;
				duration: number;
				description: string;
			}>;
			languages: string[];
			categories: string[];
			pack_downloaded?: boolean;
			manifest_count?: number;
		}>(`/reference-voices${qs ? `?${qs}` : ""}`);
	}

	async getReferenceVoiceAudioUrl(voiceId: string) {
		return `${this.getBaseUrl()}/reference-voices/${voiceId}/audio`;
	}

	async useReferenceVoice(voiceId: string, profileName: string) {
		return this.request<{
			profile_id: string;
			profile_name: string;
			sample_id: string;
		}>(`/reference-voices/${voiceId}/use`, {
			method: "POST",
			body: JSON.stringify({ profile_name: profileName }),
		});
	}

	// --- Subtitle Style ---

	async getSubtitleStyle() {
		return this.request<{
			font_family: string;
			font_size: number;
			primary_color: string;
			outline_color: string;
			background_color: string;
			position: string;
			outline_width: number;
			shadow: number;
			margin_v: number;
			bold: boolean;
			italic: boolean;
		} | null>("/settings/subtitle-style");
	}

	async saveSubtitleStyle(style: Record<string, unknown>) {
		return this.request<void>("/settings/subtitle-style", {
			method: "POST",
			body: JSON.stringify(style),
		});
	}
}
