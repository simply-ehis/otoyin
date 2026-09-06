import {
	ExclamationCircleIcon as AlertCircle,
	ArrowDownTrayIcon as Download,
	StopIcon as Square,
	SparklesIcon as Wand2,
	XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { InlineWaveformEditor } from "@/components/Workspace/InlineWaveformEditor";
import { apiClient } from "@/lib/api/client";
import type { HistoryResponse } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { formatDuration, formatEngineName } from "@/lib/utils/format";
import { useGenerationStore } from "@/stores/generationStore";
import { VoiceCleanABToggle } from "./VoiceCleanABToggle";

const EMOTION_OPTIONS = [
	{ value: "happy", label: "Happy" },
	{ value: "angry", label: "Angry" },
	{ value: "sad", label: "Sad" },
	{ value: "humour", label: "Humour" },
	{ value: "confusion", label: "Confusion" },
	{ value: "disgusted", label: "Disgusted" },
	{ value: "empathy", label: "Empathy" },
	{ value: "embarrass", label: "Embarrass" },
	{ value: "fear", label: "Fear" },
	{ value: "surprised", label: "Surprised" },
	{ value: "excited", label: "Excited" },
	{ value: "depressed", label: "Depressed" },
	{ value: "coldness", label: "Coldness" },
	{ value: "admiration", label: "Admiration" },
	{ value: "remove", label: "Remove (neutral)" },
];

const STYLE_OPTIONS = [
	{ value: "serious", label: "Serious" },
	{ value: "arrogant", label: "Arrogant" },
	{ value: "child", label: "Child" },
	{ value: "older", label: "Older" },
	{ value: "girl", label: "Girl" },
	{ value: "pure", label: "Pure" },
	{ value: "sister", label: "Sister" },
	{ value: "sweet", label: "Sweet" },
	{ value: "ethereal", label: "Ethereal" },
	{ value: "whisper", label: "Whisper" },
	{ value: "gentle", label: "Gentle" },
	{ value: "recite", label: "Recite" },
	{ value: "generous", label: "Generous" },
	{ value: "act_coy", label: "Act Coy" },
	{ value: "warm", label: "Warm" },
	{ value: "shy", label: "Shy" },
	{ value: "comfort", label: "Comfort" },
	{ value: "authority", label: "Authority" },
	{ value: "chat", label: "Chat" },
	{ value: "radio", label: "Radio" },
	{ value: "soulful", label: "Soulful" },
	{ value: "story", label: "Story" },
	{ value: "vivid", label: "Vivid" },
	{ value: "program", label: "Program" },
	{ value: "news", label: "News" },
	{ value: "advertising", label: "Advertising" },
	{ value: "roar", label: "Roar" },
	{ value: "murmur", label: "Murmur" },
	{ value: "shout", label: "Shout" },
	{ value: "deeply", label: "Deeply" },
	{ value: "loudly", label: "Loudly" },
	{ value: "remove", label: "Remove (neutral)" },
	{ value: "exaggerated", label: "Exaggerated" },
];

const SPEED_OPTIONS = [
	{ value: "faster", label: "Faster" },
	{ value: "slower", label: "Slower" },
	{ value: "more faster", label: "More Faster" },
	{ value: "more slower", label: "More Slower" },
];

interface AudioEditorPanelProps {
	sourceGen: HistoryResponse;
	onClose: () => void;
	onEditComplete?: (editedGen: HistoryResponse) => void;
}

export function AudioEditorPanel({
	sourceGen,
	onClose,
	onEditComplete,
}: AudioEditorPanelProps) {
	const { toast } = useToast();
	const [editType, setEditType] = useState<
		"style" | "speed" | "emotion" | "paralinguistic" | "denoise" | "vad"
	>("emotion");
	const [editInfo, setEditInfo] = useState("happy");
	const [targetText, setTargetText] = useState("");
	const [normalize] = useState(true);
	const [isEditing, setIsEditing] = useState(false);
	const [editedGen, setEditedGen] = useState<HistoryResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pollingId, setPollingId] = useState<string | null>(null);
	const [waveformBuffer, setWaveformBuffer] = useState<AudioBuffer | null>(
		null,
	);
	const audioContextRef = useRef<AudioContext | null>(null);
	const addPendingGeneration = useGenerationStore(
		(state) => state.addPendingGeneration,
	);

	const isParalinguistic = editType === "paralinguistic";
	const needsEditInfo =
		editType === "emotion" || editType === "style" || editType === "speed";
	const needsTargetText = editType === "paralinguistic";

	// Poll the edited generation until the background edit task finishes.
	useEffect(() => {
		if (!pollingId) {
			return;
		}
		let cancelled = false;

		const tick = async () => {
			try {
				const gen = await apiClient.getGeneration(pollingId);
				if (cancelled) {
					return;
				}
				if (gen.status === "completed") {
					setPollingId(null);
					setIsEditing(false);
					setEditedGen(gen as HistoryResponse);
					toast({
						title: "Edit complete",
						description: `Audio edited with ${editType} effect.`,
					});
					onEditComplete?.(gen as HistoryResponse);
				} else if (gen.status === "failed") {
					setPollingId(null);
					setIsEditing(false);
					const msg = gen.error || "The edit failed during processing.";
					setError(msg);
					showStudioErrorToast(new Error(msg));
				}
			} catch {
				// Transient poll failure — keep waiting.
			}
		};

		const interval = setInterval(tick, 1500);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [pollingId, editType, toast, onEditComplete]);

	// Decode audio for waveform display
	useEffect(() => {
		const activePath = editedGen?.audio_path ?? sourceGen.audio_path;
		if (!activePath) {
			return;
		}
		let cancelled = false;
		const audioUrl = apiClient.getAudioUrl(editedGen?.id ?? sourceGen.id);
		fetch(audioUrl)
			.then((r) => {
				if (!r.ok) {
					throw new Error("Failed to fetch audio");
				}
				return r.arrayBuffer();
			})
			.then((buf) => {
				if (cancelled) {
					return;
				}
				if (!audioContextRef.current) {
					audioContextRef.current = new AudioContext();
				}
				return audioContextRef.current.decodeAudioData(buf);
			})
			.then((decoded) => {
				if (!cancelled && decoded) {
					setWaveformBuffer(decoded);
				}
			})
			.catch((err) => {
				showStudioErrorToast(err);
			});
		return () => {
			cancelled = true;
		};
	}, [
		editedGen?.id,
		editedGen?.audio_path,
		sourceGen.id,
		sourceGen.audio_path,
	]);

	const handleGenerate = useCallback(async () => {
		setIsEditing(true);
		setError(null);
		setEditedGen(null);
		setPollingId(null);
		try {
			const result = await apiClient.editAudio({
				generation_id: sourceGen.id,
				edit_type: editType,
				edit_info: needsEditInfo ? editInfo : undefined,
				target_text: needsTargetText ? targetText : undefined,
				profile_id: sourceGen.profile_id,
				normalize,
			});
			addPendingGeneration(result.id);
			setPollingId(result.id);
		} catch (err) {
			setIsEditing(false);
			const msg = err instanceof Error ? err.message : "Edit failed";
			setError(msg);
			showStudioErrorToast(err);
		}
	}, [
		sourceGen.id,
		sourceGen.profile_id,
		editType,
		editInfo,
		targetText,
		normalize,
		needsEditInfo,
		needsTargetText,
		addPendingGeneration,
	]);

	return (
		<div className="border rounded-md bg-card p-4 space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Wand2 className="size-4 text-accent" />
					<h3 className="font-medium text-sm">Edit Audio</h3>
					<span className="text-xs text-muted-foreground">
						{formatEngineName(sourceGen.engine, sourceGen.model_size)}
					</span>
				</div>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					aria-label="Close editor"
				>
					<X className="size-4" />
				</Button>
			</div>

			{/* Source audio info */}
			<div className="flex items-center gap-3 text-xs text-muted-foreground">
				<span>Source: {sourceGen.text.slice(0, 80)}</span>
				<span>{formatDuration(sourceGen.duration ?? 0)}</span>
			</div>

			{/* Edit type selector */}
			<div className="space-y-2">
				<label
					htmlFor="edit-type"
					className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
				>
					Edit Type
				</label>
				<Select
					value={editType}
					onValueChange={(value) => setEditType(value as typeof editType)}
				>
					<SelectTrigger id="edit-type">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="emotion">Emotion</SelectItem>
						<SelectItem value="style">Speaking Style</SelectItem>
						<SelectItem value="paralinguistic">Paralinguistic Tags</SelectItem>
						<SelectItem value="speed">Speed</SelectItem>
						<SelectItem value="denoise">Denoise</SelectItem>
						<SelectItem value="vad">Voice Activity Detection</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Contextual controls */}
			{needsEditInfo && (
				<div className="space-y-2">
					<label
						htmlFor="edit-info"
						className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
					>
						{editType === "emotion"
							? "Emotion"
							: editType === "style"
								? "Speaking Style"
								: "Speed"}
					</label>
					<Select value={editInfo} onValueChange={setEditInfo}>
						<SelectTrigger id="edit-info">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(editType === "emotion"
								? EMOTION_OPTIONS
								: editType === "style"
									? STYLE_OPTIONS
									: SPEED_OPTIONS
							).map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			{isParalinguistic && (
				<div className="space-y-2">
					<label
						htmlFor="target-text"
						className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
					>
						Target Text with Tags
					</label>
					<Textarea
						id="target-text"
						value={targetText}
						onChange={(e) => setTargetText(e.target.value)}
						placeholder="Enter text with [Tag] tokens, e.g. Hello [Laughter] world"
						rows={3}
						className="text-sm"
					/>
					<p className="text-xs text-muted-foreground">
						Supported tags: [Breathing], [Laughter], [Uhm], [Sigh],
						[Surprise-oh], [Surprise-ah], [Surprise-wa], [Confirmation-en],
						[Question-ei], [Dissatisfaction-hnn]
					</p>
				</div>
			)}

			{/* Generate button */}
			<Button
				onClick={handleGenerate}
				disabled={
					isEditing ||
					(needsEditInfo && !editInfo) ||
					(needsTargetText && !targetText)
				}
				className="w-full"
			>
				{isEditing ? (
					<>
						<Square className="mr-2 size-4 animate-pulse" />
						Editing...
					</>
				) : (
					<>
						<Wand2 className="mr-2 size-4" />
						Apply Edit
					</>
				)}
			</Button>

			{/* Error display */}
			{error && (
				<div className="flex items-start gap-2 text-sm text-danger-text bg-danger-soft rounded-md p-3">
					<AlertCircle className="size-4 shrink-0 mt-0.5" />
					<span>{error}</span>
				</div>
			)}

			{/* Result */}
			{editedGen && (
				<div className="border rounded-md bg-secondary p-3 space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-accent">
							Edited Audio
						</span>
						<span className="text-xs text-muted-foreground">
							{formatDuration(editedGen.duration ?? 0)}
						</span>
					</div>
					{/* Audio player — uses the existing player via the audio URL */}
					<audio
						controls
						src={apiClient.getAudioUrl(editedGen.id)}
						className="w-full"
					>
						<track kind="captions" src="" label="No captions available" />
					</audio>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								apiClient
									.exportGenerationAudio(editedGen.id)
									.then((blob) => {
										const url = URL.createObjectURL(blob);
										const a = document.createElement("a");
										a.href = url;
										a.download = `edited-${editedGen.id}.wav`;
										a.click();
										URL.revokeObjectURL(url);
									})
									.catch(() =>
										toast({
											title: "Export failed",
											variant: "destructive",
										}),
									);
							}}
						>
							<Download className="mr-1 size-3" />
							Export
						</Button>
					</div>
				</div>
			)}

			{/* Waveform editor */}
			<InlineWaveformEditor
				audioPath={editedGen?.audio_path ?? sourceGen.audio_path ?? ""}
				audioBuffer={waveformBuffer}
				onProcessed={() => {
					toast({
						title: "Audio edited",
						description: "Waveform edit applied.",
					});
					// Refresh by re-fetching the generation
					if (editedGen?.id) {
						apiClient.getGeneration(editedGen.id).then((gen) => {
							setEditedGen(gen as HistoryResponse);
							onEditComplete?.(gen as HistoryResponse);
						});
					}
				}}
			/>

			{/* Voice Clean A/B comparison */}
			{(editedGen?.audio_path ?? sourceGen.audio_path) && (
				<VoiceCleanABToggle
					audioPath={editedGen?.audio_path ?? sourceGen.audio_path ?? ""}
					engine={editedGen?.engine ?? sourceGen.engine}
				/>
			)}
		</div>
	);
}
