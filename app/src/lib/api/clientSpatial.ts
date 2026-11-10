import { ADRMethods } from "./clientADR";
import type { ConvolutionPresets, SpatialPresets } from "./types";

export class SpatialMethods extends ADRMethods {
	async getSpatialPresets(): Promise<SpatialPresets> {
		return this.request("/spatial/presets");
	}

	async getConvolutionPresets(): Promise<ConvolutionPresets> {
		return this.request("/spatial/convolution-presets");
	}

	async getSpatialStatus(): Promise<{
		steam_audio: boolean;
		fallback: string;
	}> {
		return this.request("/spatial/status");
	}

	async applyBinauralPanning(
		audioPath: string,
		x: number,
		y: number,
	): Promise<Blob> {
		const resp = await this.fetchWithAuth("/spatial/apply-binaural", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ audio_path: audioPath, position: { x, y } }),
		});
		return resp.blob();
	}

	async applyDopplerEffect(
		audioPath: string,
		speed: number = 1.0,
	): Promise<Blob> {
		const resp = await this.fetchWithAuth("/spatial/apply-doppler", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ audio_path: audioPath, speed }),
		});
		return resp.blob();
	}

	async applyConvolution(
		audioPath: string,
		environment: string,
		wetDryMix: number = 0.3,
	): Promise<Blob> {
		const resp = await this.fetchWithAuth("/spatial/apply-convolution", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				audio_path: audioPath,
				environment,
				wet_dry_mix: wetDryMix,
			}),
		});
		return resp.blob();
	}

	async renderSpatialMix(
		sources: Array<{
			audioPath: string;
			x: number;
			y: number;
			z: number;
			distance: number;
			gainDb: number;
		}>,
		environment: string,
		wetDryMix: number = 0.3,
		dopplerSpeed: number = 0.0,
		binaural: boolean = true,
	): Promise<Blob> {
		const resp = await this.fetchWithAuth("/spatial/render-mix", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sources: sources.map((s) => ({
					audio_path: s.audioPath,
					x: s.x,
					y: s.y,
					z: s.z,
					distance: s.distance,
					gain_db: s.gainDb,
				})),
				environment,
				wet_dry_mix: wetDryMix,
				speed: dopplerSpeed,
				binaural,
			}),
		});
		return resp.blob();
	}

	// --- Automation & Cues ---

	async importAudioToLibrary(
		audioPath: string,
		name?: string,
	): Promise<{
		status: string;
		sample_rate: number;
		duration_seconds: number;
		channels: number;
	}> {
		return this.request("/bridge/import", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, name }),
		});
	}

	async exportAudioFromLibrary(
		audioPath: string,
		format: string = "wav",
		normalize: boolean = true,
		targetLufs: number = -16.0,
	): Promise<Blob> {
		const resp = await this.fetchWithAuth("/bridge/export", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				audio_path: audioPath,
				format,
				normalize,
				target_lufs: targetLufs,
			}),
		});
		return resp.blob();
	}

	async batchConvertAudio(
		files: string[],
		format: string,
		options?: {
			sample_rate?: number;
			bit_depth?: number;
			normalize?: boolean;
			target_lufs?: number;
			zip_output?: boolean;
		},
	): Promise<Blob | { results: any[] }> {
		const resp = await this.fetchWithAuth("/bridge/batch-convert", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				files,
				format,
				...options,
			}),
		});
		const contentType = resp.headers.get("Content-Type") || "";
		if (contentType.includes("application/zip")) {
			return resp.blob();
		}
		return resp.json();
	}

	// --- Voice Changer ---

	async getVoiceChangerCapabilities(): Promise<{
		target_latency_ms: number;
		supported_effects: string[];
		max_chain_length: number;
		sample_rate: number;
		frame_size_ms: number;
		reverb_mix?: number;
	}> {
		return this.request("/voice-changer/capabilities");
	}

	async getVoiceChangerLatency(): Promise<{
		latency_ms: number | null;
		running: boolean;
	}> {
		return this.request("/voice-changer/latency");
	}

	// --- Comping ---

	async convertVoice(opts: {
		audio_path: string;
		engine?: "rvc" | "seed_vc" | "openvoice" | "cloud";
		consent_given?: boolean;
		voice_pack?: string;
		transpose?: number;
		index_rate?: number;
		f0_method?: string;
		reference_audio_path?: string;
		diffusion_steps?: number;
		length_adjust?: number;
		inference_cfg_rate?: number;
		f0_condition?: boolean;
	}): Promise<Blob> {
		const resp = await this.fetchWithAuth("/voice-convert", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(opts),
		});
		return resp.blob();
	}

	// --- Freesound SFX ---

	assistantChat(
		messages: Array<{ role: string; content: string }>,
		modelId: string,
		apiKey?: string,
		apiBaseUrl?: string,
		tools = true,
		signal?: AbortSignal,
	): ReadableStream<Uint8Array> {
		const url = `${this.getBaseUrl()}/assistant/chat`;
		const response = fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal,
			body: JSON.stringify({
				messages,
				model_id: modelId,
				api_key: apiKey || null,
				api_base_url: apiBaseUrl || null,
				tools,
			}),
		});

		// Pipe the fetch Response through a ReadableStream for SSE parsing
		return new ReadableStream({
			async start(controller) {
				const res = await response;
				if (!res.ok) {
					const error = await res
						.json()
						.catch(() => ({ detail: res.statusText }));
					const msg = `${error.detail ?? res.statusText} (HTTP ${res.status})`;
					controller.enqueue(
						new TextEncoder().encode(
							`data: ${JSON.stringify({ type: "error", content: msg })}\n\n`,
						),
					);
					controller.close();
					return;
				}
				if (!res.body) {
					controller.enqueue(
						new TextEncoder().encode(
							`data: ${JSON.stringify({ type: "error", content: "Empty response body" })}\n\n`,
						),
					);
					controller.close();
					return;
				}
				const reader = res.body.getReader();
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					controller.enqueue(value);
				}
				controller.close();
			},
		});
	}

	async getAssistantModels(): Promise<{
		local: Array<{ id: string; name: string; size: string }>;
		api_providers: Array<{ id: string; name: string; base_url: string }>;
	}> {
		return this.request("/assistant/models");
	}

	async validateApiKey(
		apiKey: string,
		apiBaseUrl: string,
	): Promise<{ valid: boolean; model_count?: number }> {
		return this.request("/assistant/validate-key", {
			method: "POST",
			body: JSON.stringify({ api_key: apiKey, api_base_url: apiBaseUrl }),
		});
	}

	// --- Streaming STT ---

	async startStreamingSession(
		modelId: string,
		language?: string,
		sampleRate: number = 16000,
	): Promise<{ session_id: string }> {
		return this.request("/stt/stream/start", {
			method: "POST",
			body: JSON.stringify({
				model_id: modelId,
				language,
				sample_rate: sampleRate,
			}),
		});
	}

	async sendStreamingChunk(
		sessionId: string,
		audio: number[],
	): Promise<{ text: string; is_final: boolean; confidence: number }> {
		return this.request("/stt/stream/chunk", {
			method: "POST",
			body: JSON.stringify({ session_id: sessionId, audio }),
		});
	}

	async stopStreamingSession(sessionId: string): Promise<{
		full_text: string;
		segments: Array<{ text: string; start_ms: number; end_ms: number }>;
	}> {
		return this.request("/stt/stream/stop", {
			method: "POST",
			body: JSON.stringify({ session_id: sessionId }),
		});
	}

	async getStreamingStatus(): Promise<{
		active_sessions: number;
		model_loaded: boolean;
	}> {
		return this.request("/stt/stream/status");
	}

	// --- RVC Voice Conversion ---

	async getVoicePacks(): Promise<{
		voice_packs: Array<{ name: string; repo: string; installed: boolean }>;
	}> {
		return this.request("/voice-packs");
	}
	async downloadVoicePack(name: string): Promise<{ status: string; pack: string }> {
		return this.request(`/voice-pack/download?pack_name=${encodeURIComponent(name)}`, {
			method: "POST",
		});
	}


	async searchFreesound(
		query: string,
		page: number = 1,
		pageSize: number = 20,
	): Promise<{
		count: number;
		next?: string;
		previous?: string | null;
		results: Array<{
			id: number;
			name: string;
			username: string;
			license: string;
			duration: number;
			previews: { "preview-hq-ogg": string; "preview-lq-ogg": string };
			tags: string[];
		}>;
	}> {
		const params = new URLSearchParams({
			q: query,
			page: String(page),
			page_size: String(pageSize),
		});
		const res = await this.request<{
			count: number;
			next: string | null;
			previous: string | null;
			results: Array<{
				id: number;
				name: string;
				username: string;
				license: string;
				duration: number;
				previews: { "preview-hq-ogg": string; "preview-lq-ogg": string };
				tags: string[];
			}>;
		}>(`/sounds/search?${params.toString()}`);
		return {
			...res,
			next: res.next ?? undefined,
		};
	}

	async downloadFreesound(
		soundId: number,
		previewUrl: string,
	): Promise<{
		sound_id: string;
		path: string;
		cached: boolean;
	}> {
		return this.request(`/sounds/download/${soundId}`, {
			method: "POST",
			body: JSON.stringify({ preview_url: previewUrl }),
		});
	}

	async listTimecodeFrameRates() {
		const response = await this.fetchWithAuth("/timecode/frame-rates");
		return response.json();
	}

	async convertToTimecode(seconds: number, fps: number = 24) {
		const response = await this.fetchWithAuth("/timecode/convert", {
			method: "POST",
			body: JSON.stringify({ seconds, fps }),
		});
		return response.json();
	}

	// --- Phase 2: Spectrogram ---

	async computeSpectrogram(
		audioPath: string,
		fftSize: number = 2048,
		hopLength: number = 512,
	) {
		const response = await this.fetchWithAuth("/audio/spectrogram", {
			method: "POST",
			body: JSON.stringify({
				audio_path: audioPath,
				fft_size: fftSize,
				hop_length: hopLength,
			}),
		});
		return response.json();
	}

	// --- Phase 2: Lottie Export ---

	async exportLottieAudio(audioPath: string, name: string = "audio") {
		const response = await this.fetchWithAuth("/export/lottie", {
			method: "POST",
			body: JSON.stringify({ audio_path: audioPath, name }),
		});
		return response.json();
	}

	// --- ADR ---

	async muxVideoAudio(videoPath: string, audioPath: string): Promise<{ output_path: string; absolute_path: string }> {
		return this.request<{ output_path: string; absolute_path: string }>("/video/mux", {
			method: "POST",
			body: JSON.stringify({ video_path: videoPath, audio_path: audioPath }),
		});
	}
}
