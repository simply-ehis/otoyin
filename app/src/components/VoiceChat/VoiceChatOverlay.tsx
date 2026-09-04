import {
	CheckIcon as Check,
	Bars3Icon as Deny,
	ChatBubbleLeftRightIcon as History,
	MicrophoneIcon as Mic,
	Cog6ToothIcon as Settings,
	StopIcon as Stop,
	XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
	cancelResponse,
	confirmTool,
	connectVoiceChat,
	denyTool,
	disconnectVoiceChat,
	playAudioBase64,
	startMicCapture,
	stopMicCapture,
	useVoiceChatStore,
} from "@/stores/voiceChatStore";
import { ConversationHistoryBrowser } from "./ConversationHistoryBrowser";
import { VoiceChatSettings } from "./VoiceChatSettings";

const BAR_COUNT = 12;
const BAR_GAP = 2;
const BAR_WIDTH = 3;
const CANVAS_HEIGHT = 24;

function WaveformVisualizer({ isActive }: { isActive: boolean }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animFrameRef = useRef<number>(0);
	const audioLevels = useVoiceChatStore((s) => s.audioLevels);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}

		const totalWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
		canvas.width = totalWidth;
		canvas.height = CANVAS_HEIGHT;

		ctx.clearRect(0, 0, totalWidth, CANVAS_HEIGHT);

		for (let i = 0; i < BAR_COUNT; i++) {
			const level = isActive ? audioLevels[i] || 0 : 0;
			const height = isActive ? Math.max(2, level * CANVAS_HEIGHT) : 2;
			const x = i * (BAR_WIDTH + BAR_GAP);
			const y = (CANVAS_HEIGHT - height) / 2;

			ctx.fillStyle = isActive
				? `hsl(${142 + i * 2}, 70%, ${45 + i * 2}%)`
				: "hsl(240, 5%, 40%)";
			ctx.beginPath();
			ctx.roundRect(x, y, BAR_WIDTH, height, 1);
			ctx.fill();
		}

		if (isActive) {
			animFrameRef.current = requestAnimationFrame(draw);
		}
	}, [isActive, audioLevels]);

	useEffect(() => {
		draw();
		return () => cancelAnimationFrame(animFrameRef.current);
	}, [draw]);

	return (
		<canvas
			ref={canvasRef}
			className="shrink-0"
			role="img"
			aria-label="Audio waveform"
		/>
	);
}

export function VoiceChatOverlay() {
	const {
		isActive,
		isProcessing,
		isSpeaking,
		transcript,
		response,
		error,
		connectionQuality,
		reconnectAttempts,
		toolConfirmation,
		setError,
	} = useVoiceChatStore();

	const responseRef = useRef<HTMLDivElement>(null);
	const [liveTranscript, setLiveTranscript] = useState("");
	const [showSettings, setShowSettings] = useState(false);
	const [showHistory, setShowHistory] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: response/liveTranscript triggers auto-scroll
	useEffect(() => {
		if (responseRef.current) {
			responseRef.current.scrollTop = responseRef.current.scrollHeight;
		}
	}, [response, liveTranscript]);

	const handleStart = async () => {
		try {
			setError(null);
			setLiveTranscript("");
			await connectVoiceChat((msg) => {
				const store = useVoiceChatStore.getState();
				switch (msg.type) {
					case "speech_started":
						store.setIsSpeaking(true);
						setLiveTranscript("");
						break;
					case "speech_ended":
						store.setIsSpeaking(false);
						break;
					case "partial_transcript":
						setLiveTranscript(msg.text ?? "");
						break;
					case "processing":
						store.setIsProcessing(true);
						setLiveTranscript("");
						break;
					case "response":
						store.setTranscript(msg.text ?? "");
						store.setResponse(msg.response ?? "");
						store.setIsProcessing(false);
						setLiveTranscript("");
						if (msg.audio) {
							playAudioBase64(msg.audio).catch((err) => {
								debug.warn("[voice-chat] audio playback failed:", err);
							});
						}
						break;
					case "error":
						store.setError(msg.message ?? "Unknown error");
						store.setIsProcessing(false);
						setLiveTranscript("");
						break;
					case "tool_confirmation":
						store.setToolConfirmation({
							toolName: msg.tool_name ?? "",
							toolArgs: (msg.tool_args as Record<string, unknown>) ?? {},
							reason: msg.reason ?? "",
						});
						break;
				}
			});
			await startMicCapture();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to connect");
		}
	};

	const handleStop = () => {
		stopMicCapture();
		disconnectVoiceChat();
		setLiveTranscript("");
	};

	const handleCancel = () => {
		cancelResponse();
	};

	if (!isActive) {
		return (
			<Button
				variant="ghost"
				size="icon"
				className="size-8"
				onClick={handleStart}
				title="Voice Chat (V)"
				aria-label="Start Voice Chat"
			>
				<Mic className="size-4" />
			</Button>
		);
	}

	return (
		<div className="relative">
			{/* Active indicator */}
			<div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border bg-card">
				<WaveformVisualizer isActive={isSpeaking || isProcessing} />

				<div className="flex flex-col items-start">
					<div className="flex items-center gap-2">
						<div
							className={cn(
								"h-1.5 w-1.5 rounded-full shrink-0",
								connectionQuality === "good"
									? isSpeaking
										? "bg-green-500 animate-pulse"
										: isProcessing
											? "bg-yellow-500 animate-pulse"
											: "bg-green-500"
									: connectionQuality === "degraded"
										? "bg-yellow-500 animate-pulse"
										: "bg-red-500",
							)}
						/>
						<span className="text-xs text-muted-foreground min-w-[50px] tabular-nums">
							{isSpeaking
								? "Listening…"
								: isProcessing
									? "Thinking…"
									: connectionQuality === "degraded"
										? `Reconnecting (${reconnectAttempts})…`
										: connectionQuality === "disconnected"
											? "Disconnected"
											: "Ready"}
						</span>
					</div>
				</div>

				{isProcessing && (
					<Button
						variant="ghost"
						size="icon"
						className="size-6"
						onClick={handleCancel}
						title="Cancel response"
						aria-label="Cancel response"
					>
						<Stop className="size-3" />
					</Button>
				)}

				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={() => {
						setShowSettings(!showSettings);
						setShowHistory(false);
					}}
					title="Voice chat settings"
					aria-label="Voice chat settings"
				>
					<Settings className="size-3" />
				</Button>

				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={() => {
						setShowHistory(!showHistory);
						setShowSettings(false);
					}}
					title="Conversation history"
					aria-label="Conversation history"
				>
					<History className="size-3" />
				</Button>

				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={handleStop}
					title="End voice chat (V)"
					aria-label="End voice chat"
				>
					<X className="size-3" />
				</Button>
			</div>

			{/* Settings panel */}
			{showSettings && (
				<VoiceChatSettings onClose={() => setShowSettings(false)} />
			)}

			{/* Conversation history panel */}
			{showHistory && (
				<ConversationHistoryBrowser
					onClose={() => setShowHistory(false)}
					onSelect={(id) => {
						setShowHistory(false);
						void id; // Conversation context loading not yet wired
					}}
				/>
			)}

			{/* Tool confirmation panel */}
			{toolConfirmation && (
				<div className="absolute top-full left-0 mt-2 w-80 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 shadow-lg z-50 max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:mt-0 max-sm:w-full max-sm:rounded-b-none max-sm:border-b-0">
					<div className="mb-1">
						<span className="text-xs uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
							Tool Confirmation
						</span>
					</div>
					<p className="text-xs text-foreground mb-1 font-mono">
						{toolConfirmation.toolName}
					</p>
					{Object.keys(toolConfirmation.toolArgs).length > 0 && (
						<p className="text-xs text-muted-foreground mb-2 truncate">
							{Object.entries(toolConfirmation.toolArgs)
								.map(([k, v]) => `${k}=${String(v)}`)
								.join(" ")}
						</p>
					)}
					{toolConfirmation.reason && (
						<p className="text-xs text-muted-foreground mb-2">
							{toolConfirmation.reason}
						</p>
					)}
					<div className="flex gap-2">
						<Button
							size="sm"
							className="h-7 flex-1 text-xs bg-green-600 hover:bg-green-700 text-white"
							onClick={confirmTool}
						>
							<Check className="size-3 mr-1" />
							Allow
						</Button>
						<Button
							size="sm"
							variant="outline"
							className="h-7 flex-1 text-xs"
							onClick={denyTool}
						>
							<Deny className="size-3 mr-1" />
							Deny
						</Button>
					</div>
				</div>
			)}

			{/* Live transcript / Transcript + Response panel */}
			{(isSpeaking || transcript || response || liveTranscript) && (
				<div
					ref={responseRef}
					className="absolute top-full left-0 mt-2 w-80 max-h-48 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg z-50 max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:mt-0 max-sm:w-full max-sm:max-h-[50vh] max-sm:rounded-b-none max-sm:border-b-0"
				>
					{/* Live listening indicator */}
					{isSpeaking && !transcript && (
						<div className="mb-2">
							<span className="text-xs uppercase tracking-wider text-muted-foreground">
								You
							</span>
							<p className="text-xs text-muted-foreground italic">
								{liveTranscript || "Listening…"}
							</p>
						</div>
					)}

					{/* Final transcript */}
					{transcript && (
						<div className="mb-2">
							<span className="text-xs uppercase tracking-wider text-muted-foreground">
								You
							</span>
							<p className="text-xs text-foreground">{transcript}</p>
						</div>
					)}

					{/* Agent response */}
					{response && (
						<div>
							<span className="text-xs uppercase tracking-wider text-muted-foreground">
								Agent
							</span>
							<p className="text-xs text-foreground">{response}</p>
						</div>
					)}
				</div>
			)}

			{/* Error display */}
			{error && (
				<div className="absolute top-full left-0 mt-2 w-80 rounded-lg border border-destructive/50 bg-destructive/10 p-2 shadow-lg z-50 max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:mt-0 max-sm:w-full max-sm:rounded-b-none max-sm:border-b-0">
					<p className="text-xs text-destructive">{error}</p>
				</div>
			)}
		</div>
	);
}

import { debug } from "../../lib/utils/debug";
