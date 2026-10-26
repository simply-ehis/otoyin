/**
 * Streaming TTS client — consumes /tts/stream SSE endpoint.
 *
 * Usage:
 *   const abort = streamTts({
 *     text: "Hello world",
 *     engine: "kokoro",
 *     voicePrompt: { kokoro_voice: "af_heart" },
 *     onChunk: (audio, sampleRate, isFinal) => { ... },
 *     onError: (err) => { ... },
 *   });
 *   // To cancel: abort();
 */

export interface StreamTtsOptions {
	text: string;
	engine?: string;
	voicePrompt?: Record<string, unknown>;
	language?: string;
	seed?: number;
	onChunk: (audio: Float32Array, sampleRate: number, isFinal: boolean) => void;
	onError?: (error: string) => void;
	onComplete?: (result?: { audioPath?: string; generationId?: string }) => void;
}

export function streamTts(options: StreamTtsOptions): () => void {
	const {
		text,
		engine = "kokoro",
		voicePrompt = {},
		language = "en",
		seed,
		onChunk,
		onError,
		onComplete,
	} = options;

	const controller = new AbortController();

	void (async () => {
		try {
			const response = await fetch("/tts/stream", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					text,
					engine,
					voice_prompt: voicePrompt,
					language,
					seed,
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const err = await response.text();
				onError?.(err || `HTTP ${response.status}`);
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				onError?.("No response body");
				return;
			}

			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });

				// Process complete SSE events
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) {
						continue;
					}
					const jsonStr = line.slice(6).trim();
					if (!jsonStr) {
						continue;
					}

					try {
						const event = JSON.parse(jsonStr) as {
							audio?: string;
							sample_rate?: number;
							is_final?: boolean;
							error?: string;
							audio_path?: string;
							generation_id?: string;
						};

						if (event.error) {
							onError?.(event.error);
							return;
						}

						if (event.audio) {
							const binaryStr = atob(event.audio);
							const bytes = new Uint8Array(binaryStr.length);
							for (let i = 0; i < binaryStr.length; i++) {
								bytes[i] = binaryStr.charCodeAt(i);
							}
							const audio = new Float32Array(bytes.buffer);
							onChunk(
								audio,
								event.sample_rate ?? 24000,
								event.is_final ?? false,
							);
						}

						if (event.is_final) {
							onComplete?.({
								audioPath: event.audio_path,
								generationId: event.generation_id,
							});
						}
					} catch {
						// Skip malformed events
					}
				}
			}
		} catch (err) {
			if (controller.signal.aborted) {
				return;
			}
			onError?.(err instanceof Error ? err.message : "Unknown error");
		}
	})();

	return () => controller.abort();
}
