import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type {
	CaptureResponse,
	CaptureSource,
	GenerationRequest,
	VoiceProfileResponse,
} from "@/lib/api/types";
import { copyClip } from "@/lib/clip";
import type { LanguageCode } from "@/lib/constants/languages";
import { useCaptureRecordingSession } from "@/lib/hooks/useCaptureRecordingSession";
import { useDictationReadiness } from "@/lib/hooks/useDictationReadiness";
import { useCaptureSettings } from "@/lib/hooks/useSettings";
import { debug } from "@/lib/utils/debug";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";
import { CapturesActionBar } from "./ActionBar";
import { CapturesEmptyState } from "./EmptyState";
import { CapturesListPane } from "./ListPane";
import { DetailPane } from "./DetailPane";
import { ReadinessChecklist } from "./ReadinessChecklist";
import { DeleteCaptureDialog, formatDurationMs } from "./shared";

const UPLOAD_MIME = "audio/*,.wav,.mp3,.m4a,.flac,.ogg,.webm";

type PlaybackState = "idle" | "generating" | "playing";

function CapturesTabInner() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const uploadRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [debounced, setDebounced] = useState("");
	const [showRefined, setShowRefined] = useState(true);
	const [launchedPlayAsId, setLaunchedPlayAsId] = useState<string | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const playerAudioId = usePlayerStore((s) => s.audioId);
	const playerPlaying = usePlayerStore((s) => s.isPlaying);
	const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
	const pendingIds = useGenerationStore((s) => s.pendingGenerationIds);
	const addPendingGeneration = useGenerationStore((s) => s.addPendingGeneration);

	const { settings: captureSettings, update: updateCaptureSettings } = useCaptureSettings();
	const sttModel = captureSettings?.stt_model ?? "tiny.en";
	const llmModel = captureSettings?.llm_model ?? "2B-Q4_K_M";
	const hotkeyEnabled = captureSettings?.hotkey_enabled ?? false;
	const pushKeys = captureSettings?.chord_push_to_talk_keys ?? [];
	const toggleKeys = captureSettings?.chord_toggle_to_talk_keys ?? [];
	const readiness = useDictationReadiness();

	const session = useCaptureRecordingSession({
		onCaptureCreated: (capture) => setSelectedId(capture.id),
	});

	const { data: capturesData, isLoading } = useQuery({
		queryKey: ["captures"],
		queryFn: () => apiClient.listCaptures(200, 0),
	});
	const { data: profiles } = useQuery({
		queryKey: ["profiles"],
		queryFn: () => apiClient.listProfiles(),
	});
	const captures = capturesData?.items ?? [];

	useEffect(() => {
		if (captures.length === 0) {
			if (selectedId !== null) {
				setSelectedId(null);
			}
			return;
		}
		if (!selectedId || !captures.find((c) => c.id === selectedId)) {
			setSelectedId(captures[0]?.id ?? null);
		}
	}, [captures, selectedId]);

	useEffect(() => {
		const unlistens: Promise<UnlistenFn>[] = [];
		unlistens.push(
			listen<{ capture: CaptureResponse }>("capture:created", (event) => {
				const capture = event.payload?.capture;
				if (capture) {
					setSelectedId(capture.id);
				}
				void queryClient.invalidateQueries({ queryKey: ["captures"] });
			}),
		);
		unlistens.push(
			listen("capture:updated", () => {
				void queryClient.invalidateQueries({ queryKey: ["captures"] });
			}),
		);
		return () => {
			for (const p of unlistens) {
				p.then((fn) => fn()).catch(() =>
					debug.log("CapturesTab: listener unsubscribe failed"),
				);
			}
		};
	}, [queryClient]);

	useEffect(
		() => () => {
			if (searchTimer.current) {
				clearTimeout(searchTimer.current);
			}
		},
		[],
	);

	const onSearch = (value: string) => {
		setSearch(value);
		if (searchTimer.current) {
			clearTimeout(searchTimer.current);
		}
		searchTimer.current = setTimeout(() => setDebounced(value), 150);
	};

	const filtered = useMemo(() => {
		const q = debounced.trim().toLowerCase();
		if (!q) {
			return captures;
		}
		return captures.filter((c) => {
			const raw = (c.transcript_raw || "").toLowerCase();
			const refined = (c.transcript_refined || "").toLowerCase();
			return raw.includes(q) || refined.includes(q);
		});
	}, [debounced, captures]);

	const selected = captures.find((c) => c.id === selectedId) ?? null;
	const storedVoiceId = captureSettings?.default_playback_voice_id ?? null;
	const playAsVoice =
		(storedVoiceId && profiles?.find((p) => p.id === storedVoiceId)) ||
		profiles?.[0] ||
		null;
	const playAsVoiceId = playAsVoice?.id ?? null;

	const deleteMutation = useMutation({
		mutationFn: (id: string) => apiClient.deleteCapture(id),
		onSuccess: () => {
			setDeleteOpen(false);
			void queryClient.invalidateQueries({ queryKey: ["captures"] });
		},
		onError: (err: Error) =>
			toast({
				title: t("captures.toast.deleteFailed"),
				description: err.message,
				variant: "destructive",
			}),
	});

	const playAsMutation = useMutation({
		mutationFn: async ({ capture, voice }: { capture: CaptureResponse; voice: VoiceProfileResponse }) => {
			const text = capture.transcript_refined || capture.transcript_raw;
			if (!text.trim()) {
				throw new Error(t("captures.noTranscriptError"));
			}
			return apiClient.generateSpeech({
				profile_id: voice.id,
				text,
				language: (capture.language || voice.language) as LanguageCode,
				engine: voice.default_engine as GenerationRequest["engine"],
			});
		},
		onSuccess: (result) => {
			setLaunchedPlayAsId(result.id);
			addPendingGeneration(result.id);
		},
		onError: (err: Error) =>
			toast({
				title: t("captures.toast.playAsFailed"),
				description: err.message,
				variant: "destructive",
			}),
	});

	const playbackState: PlaybackState = playAsMutation.isPending
		? "generating"
		: launchedPlayAsId && pendingIds.has(launchedPlayAsId)
			? "generating"
			: launchedPlayAsId && playerAudioId === launchedPlayAsId && playerPlaying
				? "playing"
				: "idle";

	const snippetOf = (capture: CaptureResponse): string => {
		const source = capture.transcript_refined || capture.transcript_raw || "";
		return source.trim() || t("captures.snippetEmpty");
	};

	const handlePlayAs = (voice?: VoiceProfileResponse) => {
		if (!selected || playAsMutation.isPending) {
			return;
		}
		if (!voice && playbackState === "playing") {
			setIsPlaying(false);
			return;
		}
		const target = voice ?? playAsVoice;
		if (!target) {
			toast({
				title: t("captures.toast.noVoice"),
				description: t("captures.toast.noVoiceDescription"),
				variant: "destructive",
			});
			return;
		}
		if (voice && voice.id !== playAsVoiceId) {
			updateCaptureSettings({ default_playback_voice_id: voice.id });
		}
		playAsMutation.mutate({ capture: selected, voice: target });
	};

	const copyText = async () => {
		if (!selected) {
			return;
		}
		const text = showRefined
			? selected.transcript_refined || selected.transcript_raw
			: selected.transcript_raw;
		try {
			await navigator.clipboard.writeText(text || "");
			toast({ title: t("captures.toast.transcriptCopied") });
		} catch {
			toast({ title: t("captures.toast.copyFailed"), variant: "destructive" });
		}
	};

	const copyAudio = useCallback(async () => {
		if (!selected) {
			return;
		}
		try {
			await copyClip({
				kind: "capture",
				id: selected.id,
				audioUrl: apiClient.getCaptureAudioUrl(selected.id),
				name: selected.transcript_raw?.slice(0, 40) || "Capture",
				durationMs: Math.round(selected.duration_ms ?? 0),
			});
			toast({ title: t("captures.toast.audioCopied", "Audio copied to clipboard — paste in any tab") });
		} catch {
			toast({ title: t("captures.toast.copyFailed"), variant: "destructive" });
		}
	}, [selected, toast, t]);

	const exportFailed = (err: unknown) =>
		toast({
			title: t("captures.toast.exportFailed"),
			description: err instanceof Error ? err.message : String(err),
			variant: "destructive",
		});
	const exportDone = (path: string) => {
		const name = path.split(/[\\/]/).pop() ?? path;
		toast({ title: t("captures.toast.exportSuccess", { path: name }) });
	};

	const exportAudio = async () => {
		if (!selected) {
			return;
		}
		try {
			const dest = await save({
				defaultPath: `capture_${selected.id.slice(0, 8)}.wav`,
				filters: [{ name: "Audio", extensions: ["wav"] }],
			});
			if (!dest) {
				return;
			}
			const res = await fetch(apiClient.getCaptureAudioUrl(selected.id));
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			await writeFile(dest, new Uint8Array(await res.arrayBuffer()));
			exportDone(dest);
		} catch (err: unknown) {
			exportFailed(err);
		}
	};

	const exportTranscript = async () => {
		if (!selected) {
			return;
		}
		const text = (selected.transcript_refined || selected.transcript_raw || "").trim();
		if (!text) {
			toast({ title: t("captures.toast.exportEmpty"), variant: "destructive" });
			return;
		}
		try {
			const dest = await save({
				defaultPath: `capture_${selected.id.slice(0, 8)}.txt`,
				filters: [{ name: "Text", extensions: ["txt"] }],
			});
			if (!dest) {
				return;
			}
			await writeTextFile(dest, text);
			exportDone(dest);
		} catch (err: unknown) {
			exportFailed(err);
		}
	};

	const exportMarkdown = async () => {
		if (!selected) {
			return;
		}
		const lines = [
			`# Capture ${selected.id}`,
			"",
			`- Source: ${selected.source}`,
			`- Created: ${selected.created_at}`,
		];
		if (selected.duration_ms != null) {
			lines.push(`- Duration: ${formatDurationMs(selected.duration_ms)}`);
		}
		if (selected.language) {
			lines.push(`- Language: ${selected.language}`);
		}
		if (selected.stt_model) {
			lines.push(`- STT model: ${selected.stt_model}`);
		}
		if (selected.llm_model) {
			lines.push(`- LLM model: ${selected.llm_model}`);
		}
		lines.push("");
		if (selected.transcript_refined?.trim()) {
			lines.push("## Refined transcript", "", selected.transcript_refined.trim(), "");
		}
		if (selected.transcript_raw?.trim()) {
			lines.push("## Raw transcript", "", selected.transcript_raw.trim(), "");
		}
		if (!selected.transcript_refined?.trim() && !selected.transcript_raw?.trim()) {
			toast({ title: t("captures.toast.exportEmpty"), variant: "destructive" });
			return;
		}
		try {
			const dest = await save({
				defaultPath: `capture_${selected.id.slice(0, 8)}.md`,
				filters: [{ name: "Markdown", extensions: ["md"] }],
			});
			if (!dest) {
				return;
			}
			await writeTextFile(dest, lines.join("\n"));
			exportDone(dest);
		} catch (err: unknown) {
			exportFailed(err);
		}
	};

	return (
		<div className="flex h-full overflow-hidden">
			<input
				ref={uploadRef}
				type="file"
				accept={UPLOAD_MIME}
				className="hidden"
				aria-label="Upload capture audio"
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					if (file) {
						session.uploadFile(file, "file");
					}
				}}
			/>
			<CapturesListPane
				loading={isLoading}
				items={filtered}
				scrollRef={scrollRef}
				selectedId={selectedId}
				onSelect={setSelectedId}
				search={search}
				onSearch={onSearch}
				snippetOf={snippetOf}
			/>
			<div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
				<CapturesActionBar
					sttModel={sttModel}
					llmModel={llmModel}
					session={session}
					readiness={readiness}
					onUpload={() => uploadRef.current?.click()}
				/>
				{selected ? (
					<DetailPane
						capture={selected}
						showRefined={showRefined}
						onShowRefined={setShowRefined}
						llmModel={llmModel}
						playAsVoice={playAsVoice}
						playAsVoiceId={playAsVoiceId}
						profiles={profiles}
						playPending={playAsMutation.isPending}
						playbackState={playbackState}
						onPlayAs={handlePlayAs}
						onCopy={copyText}
						onCopyAudio={copyAudio}
						onExportAudio={exportAudio}
						onExportTranscript={exportTranscript}
						onExportMarkdown={exportMarkdown}
						session={session}
						deletePending={deleteMutation.isPending}
						onDelete={() => setDeleteOpen(true)}
					/>
				) : (
					<CapturesEmptyState
						loading={isLoading}
						count={captures.length}
						hotkeyEnabled={hotkeyEnabled}
						canRecord={readiness.canRecord}
						pushKeys={pushKeys}
						toggleKeys={toggleKeys}
					/>
				)}
				{!selected && !isLoading && captures.length === 0 && !readiness.canRecord ? (
					<div className="px-8 pb-8">
						<ReadinessChecklist readiness={readiness} />
					</div>
				) : null}
			</div>
			<DeleteCaptureDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				onConfirm={() => selected && deleteMutation.mutate(selected.id)}
				deleting={deleteMutation.isPending}
			/>
		</div>
	);
}

export const CapturesTab = memo(CapturesTabInner);
