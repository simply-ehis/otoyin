import { ChannelsMethods } from "./clientChannels";
import { formatErrorDetail } from "./clientCore";
import type {
	GenerationResponse,
	PitchSegment,
	StoryCreate,
	StoryDetailResponse,
	StoryHistoryDepth,
	StoryItemBatchUpdate,
	StoryItemCreate,
	StoryItemCrossfade,
	StoryItemDetail,
	StoryItemMerge,
	StoryItemMove,
	StoryItemMoveToStory,
	StoryItemReorder,
	StoryItemSpeed,
	StoryItemSplit,
	StoryItemTrim,
	StoryItemVersionUpdate,
	StoryItemVolumeUpdate,
	StoryMatchLoudness,
	StoryResponse,
} from "./types";

export class StoriesAMethods extends ChannelsMethods {
	async listStories(): Promise<StoryResponse[]> {
		return this.request<StoryResponse[]>("/stories");
	}

	async createStory(data: StoryCreate): Promise<StoryResponse> {
		return this.request<StoryResponse>("/stories", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async getStory(storyId: string): Promise<StoryDetailResponse> {
		return this.request<StoryDetailResponse>(`/stories/${storyId}`);
	}

	async updateStory(
		storyId: string,
		data: StoryCreate,
	): Promise<StoryResponse> {
		return this.request<StoryResponse>(`/stories/${storyId}`, {
			method: "PUT",
			body: JSON.stringify(data),
		});
	}

	async deleteStory(storyId: string): Promise<void> {
		await this.request<void>(`/stories/${storyId}`, {
			method: "DELETE",
		});
	}

	async addStoryItem(
		storyId: string,
		data: StoryItemCreate,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(`/stories/${storyId}/items`, {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async createGenerationFromAudio(
		audioPath: string,
		text = "Imported clip",
		profileId?: string,
	): Promise<GenerationResponse> {
		return this.request<GenerationResponse>("/generations/from-audio", {
			method: "POST",
			body: JSON.stringify({
				audio_path: audioPath,
				text,
				profile_id: profileId ?? null,
			}),
		});
	}

	async removeStoryItem(storyId: string, itemId: string): Promise<void> {
		await this.request<void>(`/stories/${storyId}/items/${itemId}`, {
			method: "DELETE",
		});
	}

	async updateStoryItemTimes(
		storyId: string,
		data: StoryItemBatchUpdate,
	): Promise<void> {
		await this.request<void>(`/stories/${storyId}/items/times`, {
			method: "PUT",
			body: JSON.stringify(data),
		});
	}

	async reorderStoryItems(
		storyId: string,
		data: StoryItemReorder,
	): Promise<StoryItemDetail[]> {
		return this.request<StoryItemDetail[]>(
			`/stories/${storyId}/items/reorder`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
	}

	async moveStoryItem(
		storyId: string,
		itemId: string,
		data: StoryItemMove,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/move`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
	}

	async trimStoryItem(
		storyId: string,
		itemId: string,
		data: StoryItemTrim,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/trim`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
	}

	async updateStoryItemVolume(
		storyId: string,
		itemId: string,
		data: StoryItemVolumeUpdate,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/volume`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
	}

	async splitStoryItem(
		storyId: string,
		itemId: string,
		data: StoryItemSplit,
	): Promise<StoryItemDetail[]> {
		return this.request<StoryItemDetail[]>(
			`/stories/${storyId}/items/${itemId}/split`,
			{
				method: "POST",
				body: JSON.stringify(data),
			},
		);
	}

	async duplicateStoryItem(
		storyId: string,
		itemId: string,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/duplicate`,
			{
				method: "POST",
			},
		);
	}

	async setStoryItemFade(
		storyId: string,
		itemId: string,
		data: { fade_in_ms: number; fade_out_ms: number },
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/fade`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
	}

	async setStoryItemGain(
		storyId: string,
		itemId: string,
		data: { gain_db: number },
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/gain`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
	}

	async setStoryItemPan(
		storyId: string,
		itemId: string,
		data: { pan: number },
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/pan`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
	}

	async normalizeStoryItem(
		storyId: string,
		itemId: string,
		data: { target_lufs: number } = { target_lufs: -14.0 },
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/normalize`,
			{
				method: "POST",
				body: JSON.stringify(data),
			},
		);
	}

	async reverseStoryItem(
		storyId: string,
		itemId: string,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/reverse`,
			{
				method: "POST",
			},
		);
	}

	async removeSilenceFromStoryItem(
		storyId: string,
		itemId: string,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/silence-removal`,
			{
				method: "POST",
			},
		);
	}

	async mergeStoryItems(
		storyId: string,
		data: StoryItemMerge,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/merge`,
			{
				method: "POST",
				body: JSON.stringify(data),
			},
		);
	}

	async setStoryItemSpeed(
		storyId: string,
		itemId: string,
		data: StoryItemSpeed,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/speed`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
	}

	async matchStoryLoudness(
		storyId: string,
		data: StoryMatchLoudness = {},
	): Promise<StoryItemDetail[]> {
		return this.request<StoryItemDetail[]>(
			`/stories/${storyId}/match-loudness`,
			{
				method: "POST",
				body: JSON.stringify(data),
			},
		);
	}

	async crossfadeStoryItems(
		storyId: string,
		itemId: string,
		data: StoryItemCrossfade,
	): Promise<StoryItemDetail[]> {
		return this.request<StoryItemDetail[]>(
			`/stories/${storyId}/items/${itemId}/crossfade`,
			{
				method: "POST",
				body: JSON.stringify(data),
			},
		);
	}

	async moveStoryItemToStory(
		storyId: string,
		itemId: string,
		data: StoryItemMoveToStory,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/move-to-story`,
			{
				method: "POST",
				body: JSON.stringify(data),
			},
		);
	}

	async storyHistoryDepth(storyId: string): Promise<StoryHistoryDepth> {
		return this.request<StoryHistoryDepth>(
			`/stories/${storyId}/history-depth`,
		);
	}

	async undoStoryEdit(storyId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/stories/${storyId}/undo`, {
			method: "POST",
		});
	}

	async redoStoryEdit(storyId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/stories/${storyId}/redo`, {
			method: "POST",
		});
	}

	async analyzePitch(
		audioPath: string,
		sampleRate: number = 48000,
	): Promise<PitchSegment[]> {
		return this.request<PitchSegment[]>("/audio/pitch-analysis", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, sample_rate: sampleRate }),
		});
	}

	// ─── Editing primitives (clipboard, stretch, shout→whisper, blend) ──────────

	async copySegment(
		audioPath: string,
		startS = 0,
		endS = 0,
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.postQuery("/audio/copy", {
			audio_path: audioPath,
			start_s: startS,
			end_s: endS,
		});
	}

	async cutSegment(
		audioPath: string,
		startS = 0,
		endS = 0,
	): Promise<{
		output_path: string;
		clip_path: string;
		duration_s: number;
		clip_duration_s: number;
	}> {
		return this.postQuery("/audio/cut", {
			audio_path: audioPath,
			start_s: startS,
			end_s: endS,
		});
	}

	async pasteSegment(
		targetPath: string,
		clipPath: string,
		atS = 0,
		crossfadeMs = 0,
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.postQuery("/audio/paste", {
			target_path: targetPath,
			clip_path: clipPath,
			at_s: atS,
			crossfade_ms: crossfadeMs,
		});
	}

	async timeStretch(
		audioPath: string,
		rate: number,
	): Promise<{
		output_path: string;
		filename: string;
		rate: number;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.postQuery("/audio/time-stretch", {
			audio_path: audioPath,
			rate,
		});
	}

	async shoutToWhisper(
		audioPath: string,
		intensity = 0.7,
	): Promise<{
		output_path: string;
		filename: string;
		intensity: number;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.postQuery("/audio/shout-to-whisper", {
			audio_path: audioPath,
			intensity,
		});
	}

	async blendAudio(
		audioPathA: string,
		audioPathB: string,
		crossfadeMs = 200,
		gapMs = 0,
		curve: "equal_power" | "linear" | "exponential" = "equal_power",
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.postQuery("/audio/blend", {
			audio_path_a: audioPathA,
			audio_path_b: audioPathB,
			crossfade_ms: crossfadeMs,
			gap_ms: gapMs,
			curve,
		});
	}

	async fetchExportFile(filename: string): Promise<Blob> {
		const safe = filename.split("/").pop() ?? filename;
		const resp = await this.fetchWithAuth(
			`/exports/${encodeURIComponent(safe)}`,
		);
		return resp.blob();
	}

	async applyEmotionTone(
		audioPath: string,
		params: {
			warmth?: number;
			energy?: number;
			brightness?: number;
			formant?: number;
		},
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/emotion-tone", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, ...params }),
		});
	}

	async insertBreaths(
		audioPath: string,
		params: {
			breath_intensity?: number;
			pause_multiplier?: number;
			use_prepared?: boolean;
		},
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/breath-pause", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, ...params }),
		});
	}

	async adjustPauses(
		audioPath: string,
		params: {
			min_pause_ms?: number;
			max_pause_ms?: number;
			target_pause_ms?: number | null;
		},
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/adjust-pauses", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, ...params }),
		});
	}

	async fadeIn(
		audioPath: string,
		durationMs = 100,
		startMs?: number,
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/fade-in", {
			method: "POST",
			body: JSON.stringify({
				audio_path: audioPath,
				duration_ms: durationMs,
				...(startMs !== undefined ? { start_ms: startMs } : {}),
			}),
		});
	}

	async fadeOut(
		audioPath: string,
		durationMs = 100,
		endMs?: number,
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/fade-out", {
			method: "POST",
			body: JSON.stringify({
				audio_path: audioPath,
				duration_ms: durationMs,
				...(endMs !== undefined ? { end_ms: endMs } : {}),
			}),
		});
	}

	async splice(
		audioPath: string,
		startMs: number,
		endMs: number,
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/splice", {
			method: "POST",
			body: JSON.stringify({
				audio_path: audioPath,
				start_ms: startMs,
				end_ms: endMs,
			}),
		});
	}

	async deleteRegion(
		audioPath: string,
		startMs: number,
		endMs: number,
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/delete-region", {
			method: "POST",
			body: JSON.stringify({
				audio_path: audioPath,
				start_ms: startMs,
				end_ms: endMs,
			}),
		});
	}

	async insertSilence(
		audioPath: string,
		positionMs: number,
		durationMs: number,
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/insert-silence", {
			method: "POST",
			body: JSON.stringify({
				audio_path: audioPath,
				position_ms: positionMs,
				duration_ms: durationMs,
			}),
		});
	}

	async trimSilence(
		audioPath: string,
		params: {
			threshold_db?: number;
			min_silence_ms?: number;
			fade_ms?: number;
		} = {},
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/trim-silence", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, ...params }),
		});
	}

	async compressAudio(
		audioPath: string,
		params: {
			threshold_db?: number;
			ratio?: number;
			attack_ms?: number;
			release_ms?: number;
			makeup_gain_db?: number;
		} = {},
	): Promise<{
		output_path: string;
		filename: string;
	}> {
		return this.postQuery("/audio/compress", {
			audio_path: audioPath,
			...params,
		});
	}

	async applyEQ(
		audioPath: string,
		params: {
			low_gain_db?: number;
			mid_gain_db?: number;
			high_gain_db?: number;
			low_cutoff_hz?: number;
			high_cutoff_hz?: number;
			preamp_db?: number;
		} = {},
	): Promise<{
		output_path: string;
		filename: string;
	}> {
		return this.request("/audio/eq", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, ...params }),
		});
	}

	async applyReverb(
		audioPath: string,
		params: {
			room_size?: number;
			damping?: number;
			wet_level?: number;
			dry_level?: number;
			width?: number;
			freeze_mode?: number;
		} = {},
	): Promise<{
		output_path: string;
		filename: string;
	}> {
		return this.request("/audio/reverb", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, ...params }),
		});
	}

	async applyEffectChain(
		audioPath: string,
		effects: Array<{
			effect_type: string;
			enabled?: boolean;
			params?: Record<string, number | string>;
		}>,
		params: { parallel?: boolean } = {},
	): Promise<{
		output_path: string;
		filename: string;
	}> {
		return this.request("/audio/effect-chain", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, effects, ...params }),
		});
	}

	async normalizeAudio(
		audioPath: string,
		params: {
			target_db?: number;
			max_peak_db?: number;
		} = {},
	): Promise<{
		output_path: string;
		filename: string;
	}> {
		return this.postQuery("/audio/normalize", {
			audio_path: audioPath,
			...params,
		});
	}

	async masterAudio(
		audioPath: string,
		params: {
			target_lufs?: number;
			true_peak_db?: number;
		} = {},
	): Promise<{
		output_path: string;
		filename: string;
	}> {
		return this.postQuery("/audio/master", {
			audio_path: audioPath,
			...params,
		});
	}

	async applyAudioTags(
		text: string,
		params: {
			engine?: string;
			voice?: string;
			language?: string;
			sample_rate?: number;
			crossfade_ms?: number;
		} = {},
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
		tags_found: number;
	}> {
		return this.request("/audio/apply-tags", {
			method: "POST",
			body: JSON.stringify({ text, ...params }),
		});
	}

	async listAudioTags(): Promise<
		Record<
			string,
			{
				base_duration_ms: number;
				variance_ms: number;
				modifiers: string[];
				has_samples?: boolean;
				sample_count?: number;
				variants?: string[];
			}
		>
	> {
		return this.request("/audio/tags", { method: "GET" });
	}

	async getSampleManifest(): Promise<
		Record<
			string,
			{
				has_samples: boolean;
				count: number;
				variants: string[];
				is_dsp: boolean;
				laion_classes: string[];
			}
		>
	> {
		return this.request("/audio/sample-manifest", { method: "GET" });
	}

	async previewAudioTag(
		tag: string,
		modifiers: string[] = [],
		sampleRate = 24000,
	): Promise<{
		output_path: string;
		filename: string;
		duration_s: number;
		sample_rate: number;
	}> {
		return this.request("/audio/tag-preview", {
			method: "POST",
			body: JSON.stringify({ tag, modifiers, sample_rate: sampleRate }),
		});
	}

	async generateSFX(data: {
		prompt: string;
		duration_seconds?: number;
		seed?: number;
	}): Promise<Blob> {
		const resp = await this.fetchWithAuth("/generate/sfx", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
		if (!resp.ok) {
			const error = await resp
				.json()
				.catch(() => ({ detail: resp.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${resp.status}`,
				),
			);
		}
		return resp.blob();
	}

	async playPianoNote(data: {
		note: number;
		duration?: number;
		velocity?: number;
	}): Promise<Blob> {
		const res = await this.fetchWithAuth(
			"/instruments/piano",
			{
				method: "POST",
				body: JSON.stringify(data),
			},
			120_000,
		);
		return res.blob();
	}

	async playDrumPad(data: {
		drum_type: string;
		duration?: number;
		velocity?: number;
	}): Promise<Blob> {
		const res = await this.fetchWithAuth(
			"/instruments/drum",
			{
				method: "POST",
				body: JSON.stringify(data),
			},
			120_000,
		);
		return res.blob();
	}

	async playSynthNote(data: {
		note: number;
		duration?: number;
		waveform?: string;
		velocity?: number;
	}): Promise<Blob> {
		const res = await this.fetchWithAuth(
			"/instruments/synth",
			{
				method: "POST",
				body: JSON.stringify(data),
			},
			120_000,
		);
		return res.blob();
	}

	async generateNoise(data: {
		noise_type: string;
		duration?: number;
		amplitude?: number;
	}): Promise<Blob> {
		const res = await this.fetchWithAuth(
			"/instruments/noise",
			{
				method: "POST",
				body: JSON.stringify(data),
			},
			120_000,
		);
		return res.blob();
	}

	async listNoiseTypes(): Promise<
		Array<{ type: string; description: string }>
	> {
		return this.request<Array<{ type: string; description: string }>>(
			"/instruments/noise-types",
		);
	}

	async listDrumTypes(): Promise<Array<{ type: string; description: string }>> {
		return this.request<Array<{ type: string; description: string }>>(
			"/instruments/drum-types",
		);
	}

	async listGMTypes(): Promise<{
		note: string;
		programs: Array<{ program: number; name: string; family: string }>;
	}> {
		return this.request<{
			note: string;
			programs: Array<{ program: number; name: string; family: string }>;
		}>("/instruments/gm-types");
	}

	async playGMInstrument(data: {
		program: number;
		note?: number;
		duration?: number;
		velocity?: number;
	}): Promise<Blob> {
		const res = await this.fetchWithAuth(
			"/instruments/gm",
			{
				method: "POST",
				body: JSON.stringify(data),
			},
			120_000,
		);
		return res.blob();
	}

	async playGmPattern(data: {
		steps: Array<Array<{
			program: number;
			note: number;
			velocity: number;
		}>>;
		step_duration?: number;
		bars?: number;
	}): Promise<Blob> {
		const res = await this.fetchWithAuth(
			"/instruments/gm-pattern",
			{
				method: "POST",
				body: JSON.stringify(data),
			},
			120_000,
		);
		return res.blob();
	}

	async playDrumMachine(data: {
		pattern?: Array<string | string[]>;
		lanes?: Record<string, number[]>;
		swing?: number;
		step_duration?: number;
		bars?: number;
		velocity?: number;
	}): Promise<Blob> {
		const res = await this.fetchWithAuth(
			"/instruments/drum-machine",
			{
				method: "POST",
				body: JSON.stringify(data),
			},
			120_000,
		);
		return res.blob();
	}

	async mixPreview(data: {
		story_id: string;
		mixer_state: {
			tracks: Array<{
				id: string;
				name: string;
				volume?: number;
				pan?: number;
				muted?: boolean;
				solo?: boolean;
				bus_id?: string;
			}>;
			buses: Array<{
				id: string;
				name: string;
				volume?: number;
				pan?: number;
			}>;
			master_volume?: number;
		};
	}): Promise<Blob> {
		const resp = await this.fetchWithAuth("/mixer/preview", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
		if (!resp.ok) {
			throw new Error(`HTTP error! status: ${resp.status}`);
		}
		return resp.blob();
	}

	async generateAutoPlan(data: {
		scenes: Array<{
			id: string;
			name: string;
			duration: number;
			dialogue?: Array<{ character: string; text: string; emotion?: string }>;
		}>;
		characters?: Array<{ id: string; name: string }>;
		fps?: number;
	}): Promise<{ plan_json: string }> {
		return this.request<{ plan_json: string }>("/audio-plan/auto", {
			method: "POST",
			body: JSON.stringify(data),
		});
	}

	async validateAudioPlan(planJson: string): Promise<{
		valid: boolean;
		warnings: string[];
		scene_count: number;
		track_count: number;
	}> {
		return this.request("/audio-plan/validate", {
			method: "POST",
			body: JSON.stringify({ plan_json: planJson }),
		});
	}

	async setStoryItemVersion(
		storyId: string,
		itemId: string,
		data: StoryItemVersionUpdate,
	): Promise<StoryItemDetail> {
		return this.request<StoryItemDetail>(
			`/stories/${storyId}/items/${itemId}/version`,
			{
				method: "PUT",
				body: JSON.stringify(data),
			},
		);
	}

	async exportStoryAudio(storyId: string): Promise<Blob> {
		const res = await this.fetchWithAuth(
			`/stories/${storyId}/export-audio`,
			{ method: "GET" },
			120_000,
		);
		return res.blob();
	}

	async exportStory(storyId: string): Promise<{ blob: Blob; filename: string }> {
		const res = await this.fetchWithAuth(
			`/stories/${storyId}/export`,
			{ method: "GET" },
			120_000,
		);
		const blob = await res.blob();
		const disposition = res.headers.get("Content-Disposition") ?? "";
		const match = /filename="([^"]+)"/.exec(disposition);
		return { blob, filename: match?.[1] ?? `story-${storyId}.dstf.zip` };
	}

	async exportStoryEpub(storyId: string): Promise<Blob> {
		const res = await this.fetchWithAuth(`/stories/${storyId}/export-epub`);
		if (!res.ok) {
			const detail = await res.json().catch(() => ({}));
			throw new Error(detail.detail || `EPUB export failed (${res.status})`);
		}
		return res.blob();
	}

	async exportStoryPdf(storyId: string): Promise<Blob> {
		const res = await this.fetchWithAuth(`/stories/${storyId}/export-pdf`);
		if (!res.ok) {
			const detail = await res.json().catch(() => ({}));
			throw new Error(detail.detail || `PDF export failed (${res.status})`);
		}
		return res.blob();
	}

	async importStory(file: File): Promise<{
		id: string;
		name: string;
		items: number;
		generations: number;
		profiles_reused: number;
		profiles_imported: number;
		message: string;
	}> {
		const formData = new FormData();
		formData.append("file", file);
		const res = await this.fetchWithAuth(
			"/stories/import",
			{ method: "POST", body: formData },
			600_000,
		);
		return res.json();
	}

	async dspCapabilities(): Promise<{
		synthesizers: string[];
		effects: string[];
		offline: boolean;
		ai: boolean;
		api: boolean;
	}> {
		return this.request<{
			synthesizers: string[];
			effects: string[];
			offline: boolean;
			ai: boolean;
			api: boolean;
		}>("/dsp/capabilities");
	}

	async dspSynth(data: {
		type: string;
		freq?: number;
		duration?: number;
		note?: string;
		wave?: string;
		cutoff?: number;
		resonance?: number;
		attack?: number;
		decay?: number;
		sustain?: number;
		release?: number;
		kind?: string;
		text?: string;
		algorithm?: number;
		feedback?: number;
	}): Promise<Blob> {
		const resp = await this.fetchWithAuth("/dsp/synth", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
		if (!resp.ok) {
			const error = await resp
				.json()
				.catch(() => ({ detail: resp.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${resp.status}`,
				),
			);
		}
		return resp.blob();
	}

	async dspUpload(
		file: Blob,
		filename = "upload.wav",
	): Promise<{ audio_path: string; size: number }> {
		const form = new FormData();
		form.append("file", file, filename);
		const resp = await this.fetchWithAuth("/dsp/upload", {
			method: "POST",
			body: form,
		});
		if (!resp.ok) {
			const detail = await resp.json().catch(() => ({}));
			throw new Error(detail.detail || `DSP upload failed (${resp.status})`);
		}
		return resp.json();
	}

	async dspEffect(data: {
		type: string;
		audio_path: string;
		carrier_freq?: number;
		bits?: number;
		drive?: number;
		kind?: string;
		cutoff?: number;
		ftype?: string;
		time?: number;
		feedback?: number;
		rate?: number;
		depth?: number;
		decay?: number;
		wet?: number;
		mod_freq?: number;
	}): Promise<Blob> {
		const resp = await this.fetchWithAuth("/dsp/effect", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
		if (!resp.ok) {
			const error = await resp
				.json()
				.catch(() => ({ detail: resp.statusText }));
			throw new Error(
				formatErrorDetail(
					error.detail,
					`HTTP error! status: ${resp.status}`,
				),
			);
		}
		return resp.blob();
	}

	// Effects & Versions
}
