import {
	DndContext,
	type DragEndEvent,
	type DragStartEvent,
	useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
	ArrowUpTrayIcon,
	BackwardIcon,
	ArrowDownTrayIcon as Download,
	EllipsisVerticalIcon as GripIcon,
	PauseIcon,
	PlayIcon,
	PlusIcon,
	ArrowRightIcon as RedoIcon,
	SignalIcon,
	SpeakerWaveIcon,
	StopIcon,
	ArrowLeftIcon as UndoIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPeakWaveform } from "@/features/audioStudio/getPeakWaveform";
import { getClip } from "@/lib/clip";
import { useHistory } from "@/lib/hooks/useHistory";
import { formatAudioDuration } from "@/lib/utils/audio";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";
import { Button } from "@/ui/button";
import { Slider } from "@/ui/slider";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { Toggle } from "@/ui/toggle";
import { useToast } from "@/ui/use-toast";
import { ImportModal } from "./ImportModal";
import {
	pixelsPerSecond,
	SNAP_GRID_SECONDS,
	snapTime,
	type Track,
	useTimelineTracks,
} from "./useTimelineTracks";

/** Track lane height. */
const LANE_HEIGHT = 56;

/**
 * Session timeline: transport bound to the shared player, history
 * generations as lanes, clip paste, media import, drag repositioning
 * with grid snap, undo/redo, and per-clip export. Track bars are
 * proportional to real durations — never decorative random data.
 */
export function TimelineView() {
	const navigate = useNavigate();
	const { toast } = useToast();
	const {
		tracks,
		setTracks,
		snap,
		setSnap,
		zoom,
		setZoom,
		undoStack,
		redoStack,
		undo,
		redo,
		maxDuration,
		sensors,
		moveTrackTo,
	} = useTimelineTracks();

	const isPlaying = usePlayerStore((s) => s.isPlaying);
	const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
	const currentTime = usePlayerStore((s) => s.currentTime);
	const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
	const duration = usePlayerStore((s) => s.duration);
	const volume = usePlayerStore((s) => s.volume);
	const setVolume = usePlayerStore((s) => s.setVolume);

	const [importOpen, setImportOpen] = useState(false);

	const { data: history } = useHistory({ limit: 20 });

	useEffect(() => {
		if (history?.items) {
			const base: Track[] = history.items.map((gen) => ({
				id: gen.id,
				name: gen.text.slice(0, 40) || "Untitled",
				muted: false,
				solo: false,
				volume: 0.75,
				audioUrl: gen.audio_path,
				duration: gen.duration,
				startTime: 0,
			}));
			setTracks(base);
			const win = window as unknown as {
				webkitAudioContext?: typeof AudioContext;
			};
			const AudioCtx = window.AudioContext ?? win.webkitAudioContext;
			const ctx = new AudioCtx();
			base.forEach(async (t) => {
				if (!t.audioUrl) {
					return;
				}
				try {
					const res = await fetch(t.audioUrl);
					const buf = await res.arrayBuffer();
					const audio = await ctx.decodeAudioData(buf);
					const peaks = getPeakWaveform(audio, 60);
					setTracks((prev) =>
						prev.map((x) =>
							x.id === t.id ? { ...x, peaks: Array.from(peaks) } : x,
						),
					);
				} catch {
					// ignore decode errors
				}
			});
		}
	}, [history?.items, setTracks]);
	const playTrack = useCallback((track: Track) => {
		if (!track.audioUrl) {
			return;
		}
		const { setAudioWithAutoPlay, setIsPlaying: setStorePlaying } =
			usePlayerStore.getState();
		setAudioWithAutoPlay(track.audioUrl, track.id, null, track.name);
		setStorePlaying(true);
	}, []);

	const togglePlay = useCallback(() => {
		const first = tracks.find((t) => t.audioUrl);
		if (!isPlaying && first?.audioUrl && !usePlayerStore.getState().audioUrl) {
			playTrack(first);
			return;
		}
		setIsPlaying(!isPlaying);
	}, [tracks, isPlaying, playTrack, setIsPlaying]);

	const pasteClip = useCallback(async () => {
		let clip: { name: string; audioUrl: string; durationMs: number } | null =
			null;
		try {
			clip = await getClip();
		} catch {
			return;
		}
		if (!clip) {
			toast({ title: "Nothing on clipboard" });
			return;
		}
		setTracks((prev) => [
			...prev,
			{
				id: `paste-${Date.now()}`,
				name: clip.name,
				muted: false,
				solo: false,
				volume: 0.75,
				audioUrl: clip.audioUrl,
				duration: clip.durationMs / 1000,
				startTime: 0,
			},
		]);
		toast({ title: `Pasted "${clip.name}" as new track` });
	}, [setTracks, toast]);

	const handleImportComplete = useCallback(
		(audioPath: string) => {
			setTracks((prev) => [
				...prev,
				{
					id: `import-${Date.now()}`,
					name: audioPath.split(/[\\/]/).pop() ?? "Import",
					muted: false,
					solo: false,
					volume: 0.75,
					audioUrl: audioPath,
					duration: 0,
					startTime: 0,
				},
			]);
			toast({ title: "Imported to timeline" });
		},
		[setTracks, toast],
	);

	const handleExport = useCallback(async () => {
		const placed = tracks.filter((t) => t.audioUrl);
		if (placed.length === 0) {
			toast({ title: "Nothing to export" });
			return;
		}
		let exported = 0;
		for (const t of placed) {
			try {
				const audioUrl = t.audioUrl;
				if (!audioUrl) {
					continue;
				}
				const res = await fetch(audioUrl);
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `${t.name.replace(/[^a-z0-9]/gi, "-")}.wav`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				exported += 1;
			} catch {
				toast({
					title: `Failed to export ${t.name}`,
					variant: "destructive",
				});
			}
		}
		toast({ title: `Exported ${exported} clip(s)` });
	}, [tracks, toast]);

	const dragStartRef = useRef<{ id: string; startTime: number } | null>(null);
	const dragCancelled = useRef(false);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			const id = event.active.id as string;
			const track = tracks.find((t) => t.id === id);
			dragStartRef.current = { id, startTime: track?.startTime ?? 0 };
			dragCancelled.current = false;
		},
		[tracks],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active } = event;
			const id = active.id as string;
			const start = dragStartRef.current;
			dragStartRef.current = null;
			if (!start || start.id !== id) {
				return;
			}
			if (dragCancelled.current) {
				dragCancelled.current = false;
				return;
			}
			const deltaX = event.delta.x;
			const pps = pixelsPerSecond(zoom);
			const deltaSeconds = deltaX / pps;
			const clamped = Math.max(0, start.startTime + deltaSeconds);
			const placed = snap ? snapTime(clamped) : clamped;
			moveTrackTo(id, placed);
		},
		[zoom, snap, moveTrackTo],
	);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
				e.preventDefault();
				undo();
			}
			if (
				((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) ||
				((e.ctrlKey || e.metaKey) && e.key === "y")
			) {
				e.preventDefault();
				redo();
			}
			if (e.key === "Escape") {
				dragCancelled.current = true;
			}
		},
		[undo, redo],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	const pps = pixelsPerSecond(zoom);
	const totalWidth = maxDuration() * pps;

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
				<ScreenHeader helpPath="/timeline" title="Timeline" />

				{tracks.length === 0 ? (
					<EmptyState
						icon={<SignalIcon aria-hidden="true" />}
						title="No tracks yet"
						body="Generate audio, import media, or paste a clip to start arranging."
						action={
							<span className="flex gap-2">
								<Button size="sm" onClick={() => navigate({ to: "/" })}>
									<PlusIcon className="mr-1 size-4" aria-hidden="true" />
									Generate audio
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => setImportOpen(true)}
								>
									<ArrowUpTrayIcon className="mr-1 size-4" aria-hidden="true" />
									Import
								</Button>
								<Button size="sm" variant="outline" onClick={pasteClip}>
									Paste
								</Button>
							</span>
						}
					/>
				) : (
					<>
						<div className="flex items-center gap-2 px-2">
							<Button
								variant="ghost"
								size="icon"
								onClick={undo}
								disabled={undoStack.length === 0}
								title="Undo"
								aria-label="Undo"
							>
								<UndoIcon className="size-4" aria-hidden="true" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={redo}
								disabled={redoStack.length === 0}
								title="Redo"
								aria-label="Redo"
							>
								<RedoIcon className="size-4" aria-hidden="true" />
							</Button>
							<Toggle
								pressed={snap}
								onPressedChange={setSnap}
								title="Snap clips to 1s grid"
								aria-label="Snap to grid"
							>
								Snap
							</Toggle>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setCurrentTime(0)}
								title="Skip to start"
								aria-label="Skip to start"
							>
								<BackwardIcon className="size-4" aria-hidden="true" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={togglePlay}
								title={isPlaying ? "Pause" : "Play"}
								aria-label={isPlaying ? "Pause" : "Play"}
							>
								{isPlaying ? (
									<PauseIcon className="size-4" aria-hidden="true" />
								) : (
									<PlayIcon className="size-4" aria-hidden="true" />
								)}
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => {
									setIsPlaying(false);
									setCurrentTime(0);
								}}
								title="Stop"
								aria-label="Stop"
							>
								<StopIcon className="size-4" aria-hidden="true" />
							</Button>
							<span className="h-4 w-px bg-border/40 shrink-0" />
							<span className="text-[10px] text-muted-foreground">
								{formatAudioDuration(currentTime)} /
								{formatAudioDuration(duration || 0)}
							</span>
							<span className="h-4 w-px bg-border/40 shrink-0" />
							<SpeakerWaveIcon
								className="size-4 text-muted-foreground shrink-0"
								aria-hidden="true"
							/>
							<Slider
								value={[volume]}
								max={1}
								step={0.05}
								onValueChange={([v]) => setVolume(v ?? volume)}
								aria-label="Monitor volume"
								className="w-20 shrink-0"
							/>
							<span className="h-4 w-px bg-border/40 shrink-0" />
							<span className="text-[10px] text-muted-foreground">Zoom</span>
							<Slider
								value={[zoom]}
								min={0.5}
								max={3}
								step={0.25}
								onValueChange={([v]) => setZoom(v ?? 1)}
								aria-label="Timeline zoom"
								className="w-24 shrink-0"
							/>
							<span className="h-4 w-px bg-border/40 shrink-0" />
							<Button
								variant="outline"
								size="sm"
								onClick={handleExport}
								title="Export placed clips as audio files"
								aria-label="Export clips"
							>
								<Download className="mr-1 size-4" aria-hidden="true" />
								Export
							</Button>
						</div>

						<div
							className="relative overflow-x-auto border border-border rounded-md bg-card min-h-[120px]"
							style={{ width: Math.max(totalWidth, 400) }}
						>
							{/* Time ruler */}
							<div
								className="absolute top-0 left-0 right-0 h-[24px] border-b border-border flex items-center text-[10px] text-muted-foreground pointer-events-none"
								style={{ paddingLeft: 90 }}
							>
								{Array.from(
									{
										length: Math.ceil(maxDuration() / SNAP_GRID_SECONDS) + 1,
									},
									(_, i) => i * SNAP_GRID_SECONDS,
								).map((seconds) => (
									<div
										key={seconds}
										className="shrink-0 whitespace-nowrap"
										style={{ left: seconds * pps }}
									>
										{seconds}s
									</div>
								))}
							</div>

							{/* Playhead */}
							<div
								className="absolute top-0 bottom-0 w-px bg-accent-ink"
								style={{
									left: Math.min(currentTime, maxDuration()) * pps,
									zIndex: 10,
								}}
								aria-hidden="true"
							/>

							{/* Lanes */}
							<div className="relative h-full">
								{tracks.map((t) => (
									<TimelineClip key={t.id} track={t} pps={pps} snap={snap} />
								))}
							</div>
						</div>
					</>
				)}
				<ImportModal
					open={importOpen}
					onOpenChange={setImportOpen}
					onImportComplete={handleImportComplete}
				/>
			</div>
		</DndContext>
	);
}

/**
 * Single timeline clip lane: drag handle + clip bar + mute button.
 *
 * `useDraggable` is called at the top level of this component (never
 * inside a `.map()` loop), so React hook rules are respected. The drag
 * handle (grip) is separate from the mute button, so muting never
 * starts a drag. While dragging, a dashed ghost shows where the clip
 * will snap; pressing Escape cancels the move.
 */
function TimelineClip({
	track,
	pps,
	snap,
}: {
	track: Track;
	pps: number;
	snap: boolean;
}) {
	const { setTracks } = useTimelineTracks();
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({ id: track.id });

	const clipLeft = track.startTime * pps;
	const clipWidth = Math.max(40, (track.duration ?? 0) * pps);
	const dragDeltaX = transform?.x ?? 0;
	const currentLeft = clipLeft + dragDeltaX;

	// Where the clip would land if dropped now (snap preview ghost).
	let previewLeft: number | null = null;
	if (isDragging) {
		const draggedSeconds = track.startTime + dragDeltaX / pps;
		const clamped = Math.max(0, draggedSeconds);
		previewLeft =
			(snap
				? Math.round(clamped / SNAP_GRID_SECONDS) * SNAP_GRID_SECONDS
				: clamped) * pps;
	}

	return (
		<div
			key={track.id}
			className="flex items-center gap-2 px-2 py-1 border-b border-border/50 last:border-0"
			style={{ height: LANE_HEIGHT }}
		>
			<span
				className="shrink-0 w-[86px] truncate text-[11px] text-muted-foreground"
				title={track.name}
			>
				{track.name}
			</span>

			{/* Draggable clip area: drag handle + bar. Mute button lives outside. */}
			<div
				ref={setNodeRef}
				{...attributes}
				{...listeners}
				className="relative flex-1 h-10 shrink-0 cursor-grab active:cursor-grabbing"
				style={{
					position: "absolute",
					left: currentLeft,
					top: 0,
					bottom: 0,
					width: clipWidth,
					transform: CSS.Transform.toString(transform),
					transition: isDragging ? "0s" : "transform 0.15s",
					opacity: isDragging ? 0.6 : 1,
				}}
			>
				{/* Snap preview ghost — shows where the clip will land on drop. */}
				{previewLeft !== null && previewLeft !== currentLeft && (
					<div
						className="absolute inset-0 border-2 border-dashed border-accent/50 bg-accent/10 pointer-events-none select-none"
						style={{ left: previewLeft }}
						aria-hidden="true"
					/>
				)}

				{/* Clip bar */}
				<div
					className={cn(
						"absolute inset-0 rounded-md overflow-hidden border border-white/20 flex items-center",
						track.muted ? "bg-strong/60" : "bg-accent/70",
					)}
				>
					<span
						className="absolute left-1 top-[-2px] text-[9px] font-bold text-white drop-shadow"
						aria-hidden="true"
					>
						{Math.round(track.startTime)}s
					</span>
					<span
						className="absolute right-1 bottom-1 text-[9px] text-white/90 drop-shadow"
						aria-hidden="true"
					>
						{(track.duration ?? 0).toFixed(1)}s
					</span>
					{track.muted && (
						<span
							className="absolute left-1 bottom-1 text-[9px] text-warning font-bold"
							aria-hidden="true"
						>
							M
						</span>
					)}
				</div>

				{/* Drag handle grip */}
				<div
					className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center"
					title="Drag to reposition"
				>
					<GripIcon
						className="size-4 text-muted-foreground/60"
						aria-hidden="true"
					/>
				</div>
			</div>

			{/* Mute button — outside the draggable area so clicking it never starts a drag. */}
			<button
				type="button"
				title={track.muted ? "Unmute track" : "Mute track"}
				aria-label={`${track.muted ? "Unmute" : "Mute"} ${track.name}`}
				aria-pressed={track.muted}
				onClick={() => {
					setTracks((prev) =>
						prev.map((x) =>
							x.id === track.id ? { ...x, muted: !x.muted } : x,
						),
					);
				}}
				className={cn(
					"rounded-sm px-2 py-0.5 text-xs font-semibold transition-colors",
					track.muted
						? "bg-warning text-warning-foreground"
						: "bg-secondary text-muted-foreground hover:text-foreground",
				)}
			>
				M
			</button>
		</div>
	);
}
