import { create } from "zustand";
import { showStudioErrorToast } from "@/lib/errors";
import { logger } from "@/lib/utils/debug";
import { useServerStore } from "./serverStore";

interface VoiceChatMessage {
	type: string;
	session_id?: string;
	text?: string;
	response?: string;
	audio?: string;
	audio_chunks?: string[];
	delta?: string;
	message?: string;
	code?: string;
	recommended?: { model_name: string; role: string }[];
	tool_name?: string;
	tool_args?: Record<string, unknown>;
	reason?: string;
}

type ConnectionQuality = "good" | "degraded" | "disconnected";

interface ToolConfirmation {
	toolName: string;
	toolArgs: Record<string, unknown>;
	reason: string;
}

interface VoiceChatState {
	isActive: boolean;
	sessionId: string | null;
	isProcessing: boolean;
	isSpeaking: boolean;
	transcript: string;
	response: string;
	error: string | null;
	enableTools: boolean;
	language: string;
	connectionQuality: ConnectionQuality;
	reconnectAttempts: number;
	audioLevels: number[];
	toolConfirmation: ToolConfirmation | null;

	setIsActive: (active: boolean) => void;
	setSessionId: (id: string | null) => void;
	setIsProcessing: (processing: boolean) => void;
	setIsSpeaking: (speaking: boolean) => void;
	setTranscript: (text: string) => void;
	setResponse: (text: string) => void;
	setError: (error: string | null) => void;
	setEnableTools: (enable: boolean) => void;
	setLanguage: (lang: string) => void;
	setConnectionQuality: (quality: ConnectionQuality) => void;
	setReconnectAttempts: (attempts: number) => void;
	setAudioLevels: (levels: number[]) => void;
	setToolConfirmation: (tc: ToolConfirmation | null) => void;
	reset: () => void;
}

export const useVoiceChatStore = create<VoiceChatState>((set) => ({
	isActive: false,
	sessionId: null,
	isProcessing: false,
	isSpeaking: false,
	transcript: "",
	response: "",
	error: null,
	enableTools: true,
	language: "en",
	connectionQuality: "disconnected",
	reconnectAttempts: 0,
	audioLevels: new Array(12).fill(0),
	toolConfirmation: null,

	setIsActive: (active) => set({ isActive: active }),
	setSessionId: (id) => set({ sessionId: id }),
	setIsProcessing: (processing) => set({ isProcessing: processing }),
	setIsSpeaking: (speaking) => set({ isSpeaking: speaking }),
	setTranscript: (text) => set({ transcript: text }),
	setResponse: (text) => set({ response: text }),
	setError: (error) => set({ error }),
	setEnableTools: (enable) => set({ enableTools: enable }),
	setLanguage: (lang) => set({ language: lang }),
	setConnectionQuality: (quality) => set({ connectionQuality: quality }),
	setReconnectAttempts: (attempts) => set({ reconnectAttempts: attempts }),
	setAudioLevels: (levels) => set({ audioLevels: levels }),
	setToolConfirmation: (tc) => set({ toolConfirmation: tc }),
	reset: () =>
		set({
			isActive: false,
			sessionId: null,
			isProcessing: false,
			isSpeaking: false,
			transcript: "",
			response: "",
			error: null,
			connectionQuality: "disconnected",
			reconnectAttempts: 0,
			audioLevels: new Array(12).fill(0),
			toolConfirmation: null,
		}),
}));

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000;
const CONNECT_TIMEOUT_MS = 10_000;

let ws: WebSocket | null = null;
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let processor: ScriptProcessorNode | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let savedMessageHandler: MessageHandler | null = null;
let savedConfig: ConnectConfig | undefined;

type MessageHandler = (msg: VoiceChatMessage) => void;
type ConnectConfig = {
	language?: string;
	systemPrompt?: string;
	sttModel?: string;
	ttsEngine?: string;
	enableTools?: boolean;
};

function getWsUrl(): string {
	const serverUrl = useServerStore.getState().serverUrl;
	const url = new URL(serverUrl);
	if (url.protocol === "https:") {
		return `wss://${url.host}/voice-chat/ws`;
	}
	return `ws://${url.host}/voice-chat/ws`;
}

function scheduleReconnect(): void {
	const store = useVoiceChatStore.getState();
	if (store.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		store.setError("Connection lost. Reconnect failed.");
		return;
	}

	store.setConnectionQuality("degraded");
	store.setReconnectAttempts(store.reconnectAttempts + 1);

	const delay = RECONNECT_DELAY_MS * 2 ** store.reconnectAttempts;
	reconnectTimer = setTimeout(() => {
		if (savedMessageHandler) {
			connectVoiceChat(savedMessageHandler, savedConfig).catch((e) => {
				logger.debug("[voiceChat] connect failed", e);
			});
		}
	}, delay);
}

export function connectVoiceChat(
	onMessage: MessageHandler,
	config?: ConnectConfig,
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (ws && ws.readyState === WebSocket.OPEN) {
			resolve();
			return;
		}

		// Tear down any lingering connection from a previous attempt
		if (ws) {
			try {
				ws.close();
			} catch {
				/* best effort */
			}
			ws = null;
		}
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}

		savedMessageHandler = onMessage;
		savedConfig = config;

		const store = useVoiceChatStore.getState();

		ws = new WebSocket(getWsUrl());

		let settled = false;
		const settle = (fn: () => void) => {
			if (!settled) {
				settled = true;
				fn();
			}
		};

		const connectTimeout = setTimeout(() => {
			settle(() => {
				ws?.close();
				store.setError("Connection timed out");
				reject(new Error("Connection timed out"));
			});
		}, CONNECT_TIMEOUT_MS);

		ws.onopen = () => {
			clearTimeout(connectTimeout);
			store.setConnectionQuality("good");
			store.setReconnectAttempts(0);
			// No default engine: omit tts_engine so the backend resolves
			// from the user's downloaded models (no-default-model policy).
			ws?.send(
				JSON.stringify({
					type: "start",
					language: config?.language ?? store.language,
					system_prompt: config?.systemPrompt,
					stt_model: config?.sttModel ?? "base",
					tts_engine: config?.ttsEngine,
					enable_tools: config?.enableTools ?? store.enableTools,
				}),
			);
		};

		ws.onmessage = (event) => {
			let msg: VoiceChatMessage;
			try {
				msg = JSON.parse(event.data);
			} catch {
				logger.debug("[voiceChat] malformed message:", event.data);
				return;
			}
			onMessage(msg);

			if (msg.type === "started") {
				clearTimeout(connectTimeout);
				store.setSessionId(msg.session_id ?? null);
				store.setIsActive(true);
				settle(() => resolve());
			} else if (msg.type === "error") {
				clearTimeout(connectTimeout);
				const errMsg =
					msg.code === "missing_model"
						? `${msg.message ?? "No voice model on deck."} Open the Models tab to grab a recommended one.`
						: (msg.message ?? "Unknown error");
				store.setError(errMsg);
				if (msg.code === "missing_model") {
					showStudioErrorToast(new Error(errMsg));
				}
				settle(() => reject(new Error(errMsg)));
			}
		};

		ws.onerror = () => {
			clearTimeout(connectTimeout);
			store.setConnectionQuality("disconnected");
		};

		ws.onclose = () => {
			const currentStore = useVoiceChatStore.getState();
			if (currentStore.isActive) {
				scheduleReconnect();
			} else {
				store.reset();
			}
			ws = null;
		};
	});
}

export function disconnectVoiceChat(): void {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	savedMessageHandler = null;
	savedConfig = undefined;

	if (processor) {
		processor.disconnect();
		processor.onaudioprocess = null;
		processor = null;
	}
	if (mediaStream) {
		for (const t of mediaStream.getTracks()) {
			t.stop();
		}
		mediaStream = null;
	}
	if (audioContext) {
		audioContext.close().catch((e) => {
			logger.debug("[voiceChat] close failed", e);
		});
		audioContext = null;
	}
	if (ws) {
		ws.send(JSON.stringify({ type: "end" }));
		ws.close();
		ws = null;
	}
	useVoiceChatStore.getState().reset();
}

export async function startMicCapture(): Promise<void> {
	if (mediaStream) {
		return;
	}

	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			sampleRate: 16000,
			channelCount: 1,
			echoCancellation: true,
			noiseSuppression: true,
		},
	});

	mediaStream = stream;
	audioContext = new AudioContext({ sampleRate: 16000 });
	const source = audioContext.createMediaStreamSource(stream);

	processor = audioContext.createScriptProcessor(2048, 1, 1);
	processor.onaudioprocess = (event) => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			return;
		}

		const inputData = event.inputBuffer.getChannelData(0);

		// Compute per-bar audio levels for the waveform visualizer
		const barCount = 12;
		const samplesPerBar = Math.floor(inputData.length / barCount);
		const levels: number[] = [];
		for (let i = 0; i < barCount; i++) {
			let sum = 0;
			const start = i * samplesPerBar;
			const end = start + samplesPerBar;
			for (let j = start; j < end; j++) {
				sum += inputData[j] * inputData[j];
			}
			const rms = Math.sqrt(sum / samplesPerBar);
			levels.push(Math.min(1, rms * 5));
		}
		useVoiceChatStore.getState().setAudioLevels(levels);

		// Float32Array is JSON-serializable — avoids expensive Array.from() copy
		ws.send(
			JSON.stringify({
				type: "audio",
				audio: [...inputData],
			}),
		);
	};

	source.connect(processor);
	// Do NOT connect to audioContext.destination — causes mic loopback feedback
}

export function stopMicCapture(): void {
	if (processor) {
		processor.disconnect();
		processor = null;
	}
	if (mediaStream) {
		for (const t of mediaStream.getTracks()) {
			t.stop();
		}
		mediaStream = null;
	}
	if (audioContext) {
		audioContext.close();
		audioContext = null;
	}
}

export function cancelResponse(): void {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ type: "cancel" }));
	}
}

export function confirmTool(): void {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ type: "confirm_tool" }));
		useVoiceChatStore.getState().setToolConfirmation(null);
	}
}

export function denyTool(): void {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ type: "deny_tool" }));
		useVoiceChatStore.getState().setToolConfirmation(null);
	}
}

export function playAudioBase64(base64Wav: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const binaryString = atob(base64Wav);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		const blob = new Blob([bytes], { type: "audio/wav" });
		const url = URL.createObjectURL(blob);
		const audio = new Audio(url);
		let settled = false;

		audio.onended = () => {
			if (!settled) {
				settled = true;
				URL.revokeObjectURL(url);
				resolve();
			}
		};
		audio.onerror = (e) => {
			if (!settled) {
				settled = true;
				URL.revokeObjectURL(url);
				reject(e);
			}
		};

		audio.load();
		audio.play().catch((err) => {
			if (!settled) {
				settled = true;
				URL.revokeObjectURL(url);
				reject(err);
			}
		});
	});
}
