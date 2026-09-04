import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
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
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";
import { CaptureDetailPane } from "./CaptureDetailPane";
import { CapturesActionBar } from "./CapturesActionBar";
import { CapturesEmptyState } from "./CapturesEmptyState";
import { CapturesListPane } from "./CapturesListPane";
import { DeleteCaptureDialog } from "./DeleteCaptureDialog";
import { formatDuration } from "./formatDuration";

const CAPTURE_AUDIO_MIME = "audio/*,.wav,.mp3,.m4a,.flac,.ogg,.webm";

type PlaybackState = "idle" | "generating" | "playing";

function CapturesTabInner() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const uploadInputRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const snippetOf = (capture: CaptureResponse): string => {
		const source = capture.transcript_refined || capture.transcript_raw || "";
		return source.trim() || t("captures.snippetEmpty");
	};

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const [showRefined, setShowRefined] = useState(true);
	const [launchedPlayAsId, setLaunchedPlayAsId] = useState<string | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const audioUrl = usePlayerStore((s) => s.audioUrl);
	const playerAudioId = usePlayerStore((s) => s.audioId);
	const playerIsPlaying = usePlayerStore((s) => s.isPlaying);
	const isPlayerVisible = !!audioUrl;

	const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);

	const addPendingGeneration = useGenerationStore(
		(s) => s.addPendingGeneration,
	);
	const pendingGenerationIds = useGenerationStore(
		(s) => s.pendingGenerationIds,
	);

	const { settings: captureSettings, update: updateCaptureSettings } =
		useCaptureSettings();
	const sttModel = captureSettings?.stt_model ?? "tiny.en";
	const llmModel = captureSettings?.llm_model ?? "2B-Q4_K_M";
	const hotkeyEnabled = captureSettings?.hotkey_enabled ?? false;
	const pushToTalkKeys = captureSettings?.chord_push_to_talk_keys ?? [];
	const toggleToTalkKeys = captureSettings?.chord_toggle_to_talk_keys ?? [];
	const readiness = useDictationReadiness();

	const session = useCaptureRecordingSession({
		onCaptureCreated: (capture) => setSelectedId(capture.id),
	});

	const { data: capturesData, isLoading: capturesLoading } = useQuery({
		queryKey: ["captures"],
		queryFn: () => apiClient.listCaptures(200, 0),
	});

	const { data: profiles } = useQuery({
		queryKey: ["profiles"],
		queryFn: () => apiClient.listProfiles(),
	});

	const captures = capturesData?.items ?? [];

	useEffect(() => {
		if (!captures.length) {
			if (selectedId !== null) {
				setSelectedId(null);
			}
			return;
		}
		if (!selectedId || !captures.find((c) => c.id === selectedId)) {
			setSelectedId(captures[0].id);
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
				queryClient.invalidateQueries({ queryKey: ["captures"] });
			}),
		);
		unlistens.push(
			listen("capture:updated", () => {
				queryClient.invalidateQueries({ queryKey: ["captures"] });
			}),
		);
		return () => {
			for (const p of unlistens) {
				p.then((fn) => fn()).catch(() =>
					debug.log("CapturesTab: listener unsubscribe failed during cleanup"),
				);
			}
		};
	}, [queryClient]);

	// Debounce search input to avoid filtering on every keystroke
	const handleSearchChange = (value: string) => {
		setSearch(value);
		if (searchTimerRef.current) {
			clearTimeout(searchTimerRef.current);
		}
		searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 150);
	};

	// Cleanup debounce timer on unmount
	useEffect(() => {
		return () => {
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}
		};
	}, []);

	const filtered = useMemo(() => {
		const q = debouncedSearch.trim().toLowerCase();
		if (!q) {
			return captures;
		}
		return captures.filter((c) => {
			const raw = (c.transcript_raw || "").toLowerCase();
			const refined = (c.transcript_refined || "").toLowerCase();
			return raw.includes(q) || refined.includes(q);
		});
	}, [debouncedSearch, captures]);

	const selected = captures.find((c) => c.id === selectedId) ?? null;
	const storedVoiceId = captureSettings?.default_playback_voice_id ?? null;
	const playAsVoice =
		(storedVoiceId && profiles?.find((p) => p.id === storedVoiceId)) ||
		profiles?.[0] ||
		null;
	const playAsVoiceId = playAsVoice?.id ?? null;

	const deleteMutation = useMutation({
		mutationFn: async (captureId: string) => apiClient.deleteCapture(captureId),
		onSuccess: () => {
			setDeleteDialogOpen(false);
			queryClient.invalidateQueries({ queryKey: ["captures"] });
		},
		onError: (err: Error) => {
			toast({
				title: t("captures.toast.deleteFailed"),
				description: err.message,
				variant: "destructive",
			});
		},
	});

	const playAsMutation = useMutation({
		mutationFn: async ({
			capture,
			voice,
		}: {
			capture: CaptureResponse;
			voice: VoiceProfileResponse;
		}) => {
			const text = capture.transcript_refined || capture.transcript_raw;
			if (!text.trim()) {
				throw new Error(t("captures.noTranscriptError"));
			}
			const language = (capture.language || voice.language) as LanguageCode;
			const engine = voice.default_engine as GenerationRequest["engine"];
			return apiClient.generateSpeech({
				profile_id: voice.id,
				text,
				language,
				engine,
			});
		},
		onSuccess: (result) => {
			setLaunchedPlayAsId(result.id);
			addPendingGeneration(result.id);
		},
		onError: (err: Error) => {
			toast({
				title: t("captures.toast.playAsFailed"),
				description: err.message,
				variant: "destructive",
			});
		},
	});

	const playbackState: PlaybackState = playAsMutation.isPending
		? "generating"
		: launchedPlayAsId && pendingGenerationIds.has(launchedPlayAsId)
			? "generating"
			: launchedPlayAsId &&
					playerAudioId === launchedPlayAsId &&
					playerIsPlaying
				? "playing"
				: "idle";

	const handleUploadClick = () => uploadInputRef.current?.click();

	const handleUploadFile = (
		e: React.ChangeEvent<HTMLInputElement>,
		source: CaptureSource,
	) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) {
			return;
		}
		session.uploadFile(file, source);
	};

	const handleCopy = async () => {
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

	const handleCopyAudio = useCallback(async () => {
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
			toast({
				title: t(
					"captures.toast.audioCopied",
					"Audio copied to clipboard — paste in any tab",
				),
			});
		} catch {
			toast({ title: t("captures.toast.copyFailed"), variant: "destructive" });
		}
	}, [selected, toast, t]);

	const exportToastSuccess = (path: string) => {
		const name = path.split(/[\\/]/).pop() ?? path;
		toast({ title: t("captures.toast.exportSuccess", { path: name }) });
	};

	const exportToastError = (err: unknown) => {
		toast({
			title: t("captures.toast.exportFailed"),
			description: err instanceof Error ? err.message : String(err),
			variant: "destructive",
		});
	};

	const handleExportAudio = async () => {
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
			const buf = new Uint8Array(await res.arrayBuffer());
			await writeFile(dest, buf);
			exportToastSuccess(dest);
		} catch (err) {
			exportToastError(err);
		}
	};

	const handleExportTranscript = async () => {
		if (!selected) {
			return;
		}
		const text = (
			selected.transcript_refined ||
			selected.transcript_raw ||
			""
		).trim();
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
			exportToastSuccess(dest);
		} catch (err) {
			exportToastError(err);
		}
	};

	const buildCaptureMarkdown = (capture: CaptureResponse): string => {
		const lines: string[] = [];
		lines.push(`# Capture ${capture.id}`, "");
		lines.push(`- **Source:** ${capture.source}`);
		lines.push(`- **Created:** ${capture.created_at}`);
		if (capture.duration_ms != null) {
			lines.push(`- **Duration:** ${formatDuration(capture.duration_ms)}`);
		}
		if (capture.language) {
			lines.push(`- **Language:** ${capture.language}`);
		}
		if (capture.stt_model) {
			lines.push(`- **STT model:** ${capture.stt_model}`);
		}
		if (capture.llm_model) {
			lines.push(`- **LLM model:** ${capture.llm_model}`);
		}
		lines.push("");
		if (capture.transcript_refined?.trim()) {
			lines.push(
				"## Refined transcript",
				"",
				capture.transcript_refined.trim(),
				"",
			);
		}
		if (capture.transcript_raw?.trim()) {
			lines.push("## Raw transcript", "", capture.transcript_raw.trim(), "");
		}
		return lines.join("\n");
	};

	const handleExportMarkdown = async () => {
		if (!selected) {
			return;
		}
		const hasContent = (
			selected.transcript_refined ||
			selected.transcript_raw ||
			""
		).trim();
		if (!hasContent) {
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
			await writeTextFile(dest, buildCaptureMarkdown(selected));
			exportToastSuccess(dest);
		} catch (err) {
			exportToastError(err);
		}
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

	return (
		<div className="h-full flex gap-0 overflow-hidden -mx-8">
			<input
				ref={uploadInputRef}
				type="file"
				accept={CAPTURE_AUDIO_MIME}
				onChange={(e) => handleUploadFile(e, "file")}
				className="hidden"
			/>

			<CapturesListPane
				capturesLoading={capturesLoading}
				filtered={filtered}
				scrollRef={scrollRef}
				selectedId={selectedId}
				setSelectedId={setSelectedId}
				search={search}
				setSearch={handleSearchChange}
				snippetOf={snippetOf}
				isPlayerVisible={isPlayerVisible}
			/>

			<div className="flex-1 flex flex-col relative overflow-hidden min-w-0">
				<CapturesActionBar
					sttModel={sttModel}
					llmModel={llmModel}
					session={session}
					readiness={readiness}
					handleUploadClick={handleUploadClick}
				/>

				{selected ? (
					<CaptureDetailPane
						selected={selected}
						showRefined={showRefined}
						setShowRefined={setShowRefined}
						isPlayerVisible={isPlayerVisible}
						llmModel={llmModel}
						playAsVoice={playAsVoice}
						playAsVoiceId={playAsVoiceId}
						profiles={profiles}
						playAsMutation={playAsMutation}
						playbackState={playbackState}
						handlePlayAs={handlePlayAs}
						handleCopy={handleCopy}
						handleCopyAudio={handleCopyAudio}
						handleExportAudio={handleExportAudio}
						handleExportTranscript={handleExportTranscript}
						handleExportMarkdown={handleExportMarkdown}
						session={session}
						deletePending={deleteMutation.isPending}
						onDeleteClick={() => setDeleteDialogOpen(true)}
					/>
				) : (
					<CapturesEmptyState
						capturesLoading={capturesLoading}
						capturesCount={captures.length}
						hotkeyEnabled={hotkeyEnabled}
						readiness={readiness}
						pushToTalkKeys={pushToTalkKeys}
						toggleToTalkKeys={toggleToTalkKeys}
					/>
				)}
			</div>

			<DeleteCaptureDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				onConfirm={() => selected && deleteMutation.mutate(selected.id)}
				deleting={deleteMutation.isPending}
			/>
		</div>
	);
}

// Memoize: subscribes to playerStore.audioUrl, audioId, isPlaying.
// Prevents re-renders from parent when player state unchanged.
export const CapturesTab = memo(CapturesTabInner);

import { debug } from "../../lib/utils/debug";
