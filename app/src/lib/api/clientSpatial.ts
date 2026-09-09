import { ADRMethods } from "./clientADR";
import { formatErrorDetail } from "./clientCore";
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
		const url = `${this.getBaseUrl()}/spatial/apply-binaural`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ audio_path: audioPath, position: { x, y } }),
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

	async applyDopplerEffect(
		audioPath: string,
		speed: number = 1.0,
	): Promise<Blob> {
		const url = `${this.getBaseUrl()}/spatial/apply-doppler`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ audio_path: audioPath, speed }),
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

	async applyConvolution(
		audioPath: string,
		environment: string,
		wetDryMix: number = 0.3,
	): Promise<Blob> {
		const url = `${this.getBaseUrl()}/spatial/apply-convolution`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				audio_path: audioPath,
				environment,
				wet_dry_mix: wetDryMix,
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

	async renderSpatial(
		audioPath: string,
		position: {
			x: number;
			y: number;
			z: number;
			distance: number;
			gain_db: number;
		},
		environment: string,
		wetDryMix: number = 0.3,
		dopplerSpeed: number = 0.0,
	): Promise<Blob> {
		const url = `${this.getBaseUrl()}/spatial/render`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				audio_path: audioPath,
				position,
				environment,
				wet_dry_mix: wetDryMix,
				speed: dopplerSpeed,
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
		const url = `${this.getBaseUrl()}/bridge/export`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				audio_path: audioPath,
				format,
				normalize,
				target_lufs: targetLufs,
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
		const url = `${this.getBaseUrl()}/bridge/batch-convert`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				files,
				format,
				...options,
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
		const contentType = response.headers.get("Content-Type") || "";
		if (contentType.includes("application/zip")) {
			return response.blob();
		}
		return response.json();
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
		const url = `${this.getBaseUrl()}/voice-convert`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(opts),
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

	// --- Freesound SFX ---

	assistantChat(
		messages: Array<{ role: string; content: string }>,
		modelId: string,
		apiKey?: string,
		apiBaseUrl?: string,
		tools = true,
	): ReadableStream<Uint8Array> {
		const url = `${this.getBaseUrl()}/assistant/chat`;
		const response = fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
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
					const msg = formatErrorDetail(error.detail, `HTTP ${res.status}`);
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
}
