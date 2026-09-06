import { Cog6ToothIcon as Settings } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import type { ModelStatusListResponse } from "@/lib/api/types";
import { TTS_ENGINES } from "@/lib/constants/engines";
import { useFirstDownloadedTtsEngine } from "@/lib/hooks/useFirstDownloadedTtsEngine";
import { cn } from "@/lib/utils/cn";

interface VoiceChatSettingsData {
	stt_model: string;
	tts_engine: string;
	tts_voice: string;
	llm_provider: string;
	llm_model: string;
	language: string;
	system_prompt: string;
	enable_tools: boolean;
	voice_changer_enabled: boolean;
	voice_changer_port: number;
}

interface VoiceChangerStatus {
	running: boolean;
	pid?: number;
}

const STT_MODELS = [
	{ id: "tiny", name: "Tiny (fastest)" },
	{ id: "base", name: "Base (balanced)" },
	{ id: "small", name: "Small (better accuracy)" },
	{ id: "medium", name: "Medium (high accuracy)" },
	{ id: "large", name: "Large (best accuracy)" },
];

// ttsEngineOptions is built inside the component from live modelStatus

const LANGUAGES = [
	{ id: "en", name: "English" },
	{ id: "es", name: "Spanish" },
	{ id: "fr", name: "French" },
	{ id: "de", name: "German" },
	{ id: "it", name: "Italian" },
	{ id: "pt", name: "Portuguese" },
	{ id: "zh", name: "Chinese" },
	{ id: "ja", name: "Japanese" },
	{ id: "ko", name: "Korean" },
];

const DEFAULT_SETTINGS: VoiceChatSettingsData = {
	stt_model: "base",
	tts_engine: "",
	tts_voice: "",
	llm_provider: "",
	llm_model: "",
	language: "en",
	system_prompt: "",
	enable_tools: true,
	voice_changer_enabled: false,
	voice_changer_port: 17494,
};

export function VoiceChatSettings({ onClose }: { onClose: () => void }) {
	// Resolve the default TTS engine from downloaded models — do NOT assume kokoro.
	const firstEngine = useFirstDownloadedTtsEngine();
	const { data: modelStatus } = useQuery<ModelStatusListResponse>({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
		refetchInterval: 30_000,
	});
	const ttsEngineOptions = useMemo(() => {
		const downloaded = new Set(
			(modelStatus?.models ?? [])
				.filter((m) => m.downloaded && m.category === "tts")
				.map((m) => m.engine),
		);
		return Object.entries(TTS_ENGINES)
			.filter(([id]) => downloaded.has(id))
			.map(([id, name]) => ({ id, name }));
	}, [modelStatus]);
	const [settings, setSettings] = useState<VoiceChatSettingsData>({
		...DEFAULT_SETTINGS,
		tts_engine: firstEngine ?? "",
	});
	const [saving, setSaving] = useState(false);
	const [loading, setLoading] = useState(true);
	const [vcStatus, setVcStatus] = useState<VoiceChangerStatus>({
		running: false,
	});
	const [vcAction, setVcAction] = useState<string | null>(null);

	useEffect(() => {
		apiClient
			.getVoiceChatSettings()
			.then((s) => {
				setSettings({
					stt_model: (s.stt_model as string) || "base",
					tts_engine: (s.tts_engine as string) || "",
					tts_voice: (s.tts_voice as string) || "",
					llm_provider: (s.llm_provider as string) || "",
					llm_model: (s.llm_model as string) || "",
					language: (s.language as string) || "en",
					system_prompt: (s.system_prompt as string) || "",
					enable_tools: (s.enable_tools as boolean) ?? true,
					voice_changer_enabled: (s.voice_changer_enabled as boolean) ?? false,
					voice_changer_port: (s.voice_changer_port as number) || 17494,
				});
			})
			.catch((err) => {
				debug.warn("[voice-chat] settings load failed:", err);
			})
			.finally(() => setLoading(false));

		// Check voice-changer status
		apiClient
			.getVoiceChangerStatus()
			.then(setVcStatus)
			.catch((err) => {
				debug.warn("[voice-chat] status check failed:", err);
			});
	}, []);

	const handleSave = useCallback(async () => {
		setSaving(true);
		try {
			await apiClient.saveVoiceChatSettings(
				settings as unknown as Record<string, unknown>,
			);
			onClose();
		} finally {
			setSaving(false);
		}
	}, [settings, onClose]);

	const handleSpawnVc = useCallback(async () => {
		setVcAction("spawning");
		try {
			const result = await apiClient.spawnVoiceChanger();
			setVcStatus({ running: true, pid: result.pid });
		} catch {
			// ignore
		} finally {
			setVcAction(null);
		}
	}, []);

	const handleKillVc = useCallback(async () => {
		setVcAction("killing");
		try {
			await apiClient.killVoiceChanger();
			setVcStatus({ running: false });
		} catch {
			// ignore
		} finally {
			setVcAction(null);
		}
	}, []);

	const update = <K extends keyof VoiceChatSettingsData>(
		key: K,
		value: VoiceChatSettingsData[K],
	) => {
		setSettings((prev) => {
			const next = { ...prev };
			next[key] = value;
			return next;
		});
	};

	if (loading) {
		return (
			<div className="p-4 text-xs text-muted-foreground">Loading settings…</div>
		);
	}

	return (
		<div className="border-t border-border bg-sidebar p-4 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:mt-0 max-sm:w-full max-sm:max-h-[70vh] max-sm:rounded-b-none max-sm:border-b-0 max-sm:z-50">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Settings className="size-4 text-muted-foreground" />
					<span className="text-xs font-semibold">Voice Chat Settings</span>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={onClose}
				>
					x
				</Button>
			</div>

			{/* STT Model */}
			<div className="space-y-1.5">
				<label
					htmlFor="vc-stt-model"
					className="text-xs uppercase tracking-wider text-muted-foreground"
				>
					Speech-to-Text Model
				</label>
				<select
					id="vc-stt-model"
					value={settings.stt_model}
					onChange={(e) => update("stt_model", e.target.value)}
					className="w-full h-8 px-2 rounded border border-border bg-background text-xs"
				>
					{STT_MODELS.map((m) => (
						<option key={m.id} value={m.id}>
							{m.name}
						</option>
					))}
				</select>
			</div>

			{/* TTS Engine */}
			<div className="space-y-1.5">
				<label
					htmlFor="vc-tts-engine"
					className="text-xs uppercase tracking-wider text-muted-foreground"
				>
					Text-to-Speech Engine
				</label>
				<select
					id="vc-tts-engine"
					value={settings.tts_engine}
					onChange={(e) => update("tts_engine", e.target.value)}
					className="w-full h-8 px-2 rounded border border-border bg-background text-xs"
				>
					<option value="">Select engine…</option>
					{ttsEngineOptions.map((e) => (
						<option key={e.id} value={e.id}>
							{e.name}
						</option>
					))}
				</select>
			</div>

			{/* TTS Voice */}
			<div className="space-y-1.5">
				<label
					htmlFor="vc-tts-voice"
					className="text-xs uppercase tracking-wider text-muted-foreground"
				>
					Voice (optional)
				</label>
				<input
					id="vc-tts-voice"
					type="text"
					value={settings.tts_voice}
					onChange={(e) => update("tts_voice", e.target.value)}
					placeholder="Default voice"
					className="w-full h-8 px-2 rounded border border-border bg-background text-xs"
				/>
			</div>

			{/* Language */}
			<div className="space-y-1.5">
				<label
					htmlFor="vc-language"
					className="text-xs uppercase tracking-wider text-muted-foreground"
				>
					Language
				</label>
				<select
					id="vc-language"
					value={settings.language}
					onChange={(e) => update("language", e.target.value)}
					className="w-full h-8 px-2 rounded border border-border bg-background text-xs"
				>
					{LANGUAGES.map((l) => (
						<option key={l.id} value={l.id}>
							{l.name}
						</option>
					))}
				</select>
			</div>

			{/* LLM Provider */}
			<div className="space-y-1.5">
				<label
					htmlFor="vc-llm-provider"
					className="text-xs uppercase tracking-wider text-muted-foreground"
				>
					LLM Provider (optional)
				</label>
				<input
					id="vc-llm-provider"
					type="text"
					value={settings.llm_provider}
					onChange={(e) => update("llm_provider", e.target.value)}
					placeholder="Default (local)"
					className="w-full h-8 px-2 rounded border border-border bg-background text-xs"
				/>
			</div>

			{/* LLM Model */}
			<div className="space-y-1.5">
				<label
					htmlFor="vc-llm-model"
					className="text-xs uppercase tracking-wider text-muted-foreground"
				>
					LLM Model (optional)
				</label>
				<input
					id="vc-llm-model"
					type="text"
					value={settings.llm_model}
					onChange={(e) => update("llm_model", e.target.value)}
					placeholder="Default model"
					className="w-full h-8 px-2 rounded border border-border bg-background text-xs"
				/>
			</div>

			{/* System Prompt */}
			<div className="space-y-1.5">
				<label
					htmlFor="vc-system-prompt"
					className="text-xs uppercase tracking-wider text-muted-foreground"
				>
					System Prompt
				</label>
				<textarea
					id="vc-system-prompt"
					value={settings.system_prompt}
					onChange={(e) => update("system_prompt", e.target.value)}
					placeholder="You are a helpful voice assistant…"
					rows={3}
					className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs resize-none"
				/>
			</div>

			{/* Enable Tools */}
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={() => update("enable_tools", !settings.enable_tools)}
					className={cn(
						"h-5 w-9 rounded-full transition-colors relative",
						settings.enable_tools ? "bg-green-500" : "bg-muted",
					)}
				>
					<span
						className={cn(
							"absolute top-0.5 size-4 rounded-full bg-white transition-transform",
							settings.enable_tools ? "left-[18px]" : "left-0.5",
						)}
					/>
				</button>
				<span className="text-xs">Enable tool calling</span>
			</div>

			{/* Voice Changer Section */}
			<div className="border-t border-border pt-4 space-y-3">
				<div className="flex items-center justify-between">
					<span className="text-xs font-semibold">
						Voice Changer (Headless)
					</span>
					<span
						className={cn(
							"text-xs px-1.5 py-0.5 rounded",
							vcStatus.running
								? "bg-success-soft text-success"
								: "bg-muted text-muted-foreground",
						)}
					>
						{vcStatus.running ? `Running (pid ${vcStatus.pid})` : "Stopped"}
					</span>
				</div>

				<p className="text-xs text-muted-foreground/60">
					Real-time voice converter for calls/streaming. Chain: mic → denoise →
					transcribe → TTS → enhance.
				</p>

				{/* Enable toggle */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() =>
							update("voice_changer_enabled", !settings.voice_changer_enabled)
						}
						className={cn(
							"h-5 w-9 rounded-full transition-colors relative",
							settings.voice_changer_enabled ? "bg-green-500" : "bg-muted",
						)}
					>
						<span
							className={cn(
								"absolute top-0.5 size-4 rounded-full bg-white transition-transform",
								settings.voice_changer_enabled ? "left-[18px]" : "left-0.5",
							)}
						/>
					</button>
					<span className="text-xs">Auto-start with server</span>
				</div>

				{/* Port */}
				<div className="space-y-1.5">
					<label
						htmlFor="vc-port"
						className="text-xs uppercase tracking-wider text-muted-foreground"
					>
						WebSocket Port
					</label>
					<input
						id="vc-port"
						type="number"
						value={settings.voice_changer_port}
						onChange={(e) =>
							update("voice_changer_port", Number(e.target.value))
						}
						className="w-full h-8 px-2 rounded border border-border bg-background text-xs"
					/>
				</div>

				{/* Spawn/Kill buttons */}
				<div className="flex gap-2">
					{vcStatus.running ? (
						<Button
							size="sm"
							variant="destructive"
							className="h-7 text-xs flex-1"
							onClick={handleKillVc}
							disabled={vcAction === "killing"}
						>
							{vcAction === "killing" ? "Stopping…" : "Stop Service"}
						</Button>
					) : (
						<Button
							size="sm"
							className="h-7 text-xs flex-1"
							onClick={handleSpawnVc}
							disabled={vcAction === "spawning"}
						>
							{vcAction === "spawning" ? "Starting…" : "Start Service"}
						</Button>
					)}
				</div>

				{vcStatus.running && (
					<div className="text-xs text-muted-foreground/60">
						Connect via WebSocket: ws://127.0.0.1:{settings.voice_changer_port}
						/voice-changer/ws
					</div>
				)}
			</div>

			{/* Save button */}
			<Button
				size="sm"
				className="w-full h-8 text-xs"
				onClick={handleSave}
				disabled={saving}
			>
				{saving ? "Saving…" : "Save Settings"}
			</Button>
		</div>
	);
}

import { debug } from "../../lib/utils/debug";
