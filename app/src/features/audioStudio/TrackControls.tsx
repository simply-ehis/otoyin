import {
	ChevronDownIcon,
	ChevronRightIcon,
	DocumentTextIcon as Document,
} from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import { type StudioTrack, useAudioStudioStore } from "./AudioStudioStore";
import { TrackMeter } from "./TrackMeter";

const TRACK_COLORS = [
	"hsl(var(--accent))",
	"hsl(142, 76%, 36%)",
	"hsl(248, 90%, 66%)",
	"hsl(27, 96%, 61%)",
	"hsl(340, 82%, 52%)",
	"hsl(190, 90%, 50%)",
	"hsl(60, 80%, 50%)",
	"hsl(0, 80%, 55%)",
	"hsl(180, 50%, 45%)",
	"hsl(280, 60%, 55%)",
	"hsl(30, 80%, 50%)",
	"hsl(210, 70%, 55%)",
];

function TrackColorPicker({
	track,
	close,
}: {
	track: StudioTrack;
	close: () => void;
}) {
	const updateTrack = useAudioStudioStore((s) => s.updateTrack);
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: backdrop closes on any input
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop is interactive overlay
		<div className="fixed inset-0 z-50" onClick={close}>
			<div
				role="dialog"
				aria-label="Track color picker"
				className="absolute z-50 bg-card border border-border rounded-md shadow-lg p-2"
				style={{ top: 40, left: 0 }}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						close();
					}
				}}
			>
				<div className="grid grid-cols-6 gap-1 mb-1">
					{TRACK_COLORS.map((c) => (
						<button
							key={c}
							type="button"
							className={cn(
								"size-5 rounded-full border-2 hover:scale-110 transition-transform",
								track.color === c ? "border-foreground" : "border-transparent",
							)}
							style={{ backgroundColor: c }}
							onClick={() => {
								updateTrack(track.id, { color: c });
								close();
							}}
							aria-label={`Set color ${c}`}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

export function TrackIdentity({ track }: { track: StudioTrack }) {
	const updateTrack = useAudioStudioStore((s) => s.updateTrack);
	const toggleTrackExpanded = useAudioStudioStore((s) => s.toggleTrackExpanded);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(track.name);
	const [showColorPicker, setShowColorPicker] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const commit = useCallback(() => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== track.name) {
			updateTrack(track.id, { name: trimmed });
		} else {
			setDraft(track.name);
		}
		setEditing(false);
	}, [draft, track.name, track.id, updateTrack]);

	if (editing) {
		return (
			<input
				ref={inputRef}
				type="text"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						commit();
					} else if (e.key === "Escape") {
						setDraft(track.name);
						setEditing(false);
					}
				}}
				className="text-xs font-medium text-foreground bg-background border border-border rounded px-1 w-full text-center outline-none focus:ring-1 focus:ring-ring"
				// biome-ignore lint/a11y/noAutofocus: intentional — input appears on click-to-rename
				autoFocus
				aria-label="Track name"
			/>
		);
	}

	return (
		<div className="flex flex-col items-center gap-0.5 w-full">
			<button
				type="button"
				className="size-2.5 rounded-full border border-white/20 shrink-0 cursor-pointer hover:scale-125 transition-transform"
				style={{ backgroundColor: track.color }}
				title="Change track color"
				aria-label="Change track color"
				onClick={() => setShowColorPicker(true)}
			/>
			{showColorPicker && (
				<TrackColorPicker
					track={track}
					close={() => setShowColorPicker(false)}
				/>
			)}
			<button
				type="button"
				onClick={() => {
					setDraft(track.name);
					setEditing(true);
				}}
				className="text-xs font-medium text-foreground truncate w-full text-center bg-transparent border-0 p-0 hover:text-accent cursor-text"
				title="Click to rename"
			>
				{track.name}
			</button>
			<button
				type="button"
				onClick={() => toggleTrackExpanded(track.id)}
				className="text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 p-0 cursor-pointer"
				title={track.expanded ? "Collapse track" : "Expand track"}
				aria-label={track.expanded ? "Collapse track" : "Expand track"}
			>
				{track.expanded ? (
					<ChevronDownIcon className="size-3" />
				) : (
					<ChevronRightIcon className="size-3" />
				)}
			</button>
		</div>
	);
}

export function TrackMuteSolo({
	track,
	onMute,
	onSolo,
}: {
	track: StudioTrack;
	onMute: () => void;
	onSolo: () => void;
}) {
	return (
		<div className="flex gap-1">
			<button
				type="button"
				aria-pressed={track.muted}
				aria-label={track.muted ? "Unmute track" : "Mute track"}
				className={cn(
					"px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97]",
					track.muted
						? "bg-danger-soft text-danger-text"
						: "bg-muted text-muted-foreground hover:bg-secondary",
				)}
				onClick={onMute}
				title={track.muted ? "Unmute" : "Mute"}
			>
				M
			</button>
			<button
				type="button"
				aria-pressed={track.solo}
				aria-label={track.solo ? "Unsolo track" : "Solo track"}
				className={cn(
					"px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97]",
					track.solo
						? "bg-accent-muted text-accent"
						: "bg-muted text-muted-foreground hover:bg-secondary",
				)}
				onClick={onSolo}
				title={track.solo ? "Unsolo" : "Solo"}
			>
				S
			</button>
		</div>
	);
}

export function TrackPan({
	track,
	onPan,
}: {
	track: StudioTrack;
	onPan: (pan: number) => void;
}) {
	return (
		<div className="flex items-center gap-1 w-full">
			<span className="text-xs text-muted-foreground">L</span>
			<Slider
				min={-1}
				max={1}
				step={0.01}
				value={[track.pan]}
				onValueChange={([v]) => onPan(v)}
				className="flex-1"
				aria-label={`${track.name} pan`}
			/>
			<span className="text-xs text-muted-foreground">R</span>
		</div>
	);
}

export function TrackToolButtons({
	track,
	showAutomation,
	showPlugins,
	setShowPlugins,
	showCrossfade,
	setShowCrossfade,
	otherTracks,
	onAddAutomation,
	onAddPanAutomation,
	onClearAutomation,
	updateTrack,
	onTranscribe,
}: {
	track: StudioTrack;
	showAutomation: boolean;
	showPlugins: boolean;
	setShowPlugins: (v: boolean) => void;
	showCrossfade: boolean;
	setShowCrossfade: (v: boolean) => void;
	otherTracks: StudioTrack[];
	onAddAutomation: () => void;
	onAddPanAutomation: () => void;
	onClearAutomation: () => void;
	updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
	onTranscribe: () => void;
}) {
	return (
		<div className="flex gap-1 flex-wrap justify-center">
			<button
				type="button"
				aria-pressed={track.showSpectrogram}
				aria-label={
					track.showSpectrogram ? "Hide spectrogram" : "Show spectrogram"
				}
				className={cn(
					"px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97]",
					track.showSpectrogram
						? "bg-accent-muted text-accent"
						: "bg-muted text-muted-foreground hover:bg-secondary",
				)}
				onClick={() =>
					updateTrack(track.id, { showSpectrogram: !track.showSpectrogram })
				}
				title={track.showSpectrogram ? "Hide spectrogram" : "Show spectrogram"}
			>
				F
			</button>
			<button
				type="button"
				aria-pressed={showPlugins}
				aria-label="Plugins"
				className={cn(
					"px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97]",
					(track.pluginChain ?? []).length > 0
						? "bg-accent-muted text-accent"
						: "bg-muted text-muted-foreground hover:bg-secondary",
				)}
				onClick={() => setShowPlugins(!showPlugins)}
				title={
					(track.pluginChain ?? []).length > 0
						? `${(track.pluginChain ?? []).length} plugin(s)`
						: "Add plugins"
				}
			>
				PL
			</button>
			{showAutomation && (
				<>
					<button
						type="button"
						aria-label="Add volume keyframe"
						className="px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97] bg-muted text-muted-foreground hover:bg-secondary"
						onClick={onAddAutomation}
						title="Add volume keyframe at current time"
					>
						V+
					</button>
					<button
						type="button"
						aria-label="Add pan keyframe"
						className="px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97] bg-muted text-muted-foreground hover:bg-secondary"
						onClick={onAddPanAutomation}
						title="Add pan keyframe at current time"
					>
						P+
					</button>
					{((track.volumeAutomation ?? []).length > 0 ||
						(track.panAutomation ?? []).length > 0) && (
						<button
							type="button"
							aria-label="Clear automation"
							className="px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97] bg-danger-soft text-danger-text [@media(hover:hover)]:hover:brightness-110"
							onClick={onClearAutomation}
							title="Clear all automation"
						>
							Clear
						</button>
					)}
				</>
			)}
			{otherTracks.length > 0 && (
				<button
					type="button"
					aria-pressed={showCrossfade}
					aria-label="Crossfade"
					className={cn(
						"px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97]",
						track.crossfade
							? "bg-accent-muted text-accent"
							: "bg-muted text-muted-foreground hover:bg-secondary",
					)}
					onClick={() => setShowCrossfade(!showCrossfade)}
					title="Crossfade"
				>
					XF
				</button>
			)}
			{otherTracks.length > 0 && (
				<Select
					value={track.sidechainSourceId ?? ""}
					onValueChange={(v) =>
						updateTrack(track.id, {
							sidechainSourceId: v || null,
						})
					}
				>
					<SelectTrigger
						className="h-6 text-[10px] w-14"
						aria-label="Sidechain source"
						title={
							track.sidechainSourceId
								? `Sidechain from ${otherTracks.find((t) => t.id === track.sidechainSourceId)?.name ?? "unknown"}`
								: "Sidechain (duck this track by another)"
						}
					>
						<SelectValue placeholder="SC" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">Off</SelectItem>
						{otherTracks.map((ot) => (
							<SelectItem key={ot.id} value={ot.id}>
								{ot.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			{track.audioUrl && track.generationId && (
				<button
					type="button"
					aria-label="Transcribe audio"
					className={cn(
						"px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97]",
						"bg-accent-muted text-accent [@media(hover:hover)]:hover:brightness-110",
					)}
					onClick={onTranscribe}
					title="Transcribe audio (opens transcript editor)"
				>
					<Document className="h-3 w-3" />
				</button>
			)}
		</div>
	);
}

export function TrackCrossfadeControls({
	track,
	showCrossfade,
	updateTrack,
}: {
	track: StudioTrack;
	showCrossfade: boolean;
	updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
}) {
	const otherTracks = useAudioStudioStore((s) => s.tracks).filter(
		(t) => t.id !== track.id,
	);
	if (!showCrossfade) {
		return null;
	}
	return (
		<div className="flex flex-col gap-1 w-full mt-1">
			<Select
				value={track.crossfade?.targetTrackId ?? ""}
				onValueChange={(targetId) => {
					if (!targetId) {
						updateTrack(track.id, { crossfade: null });
					} else {
						updateTrack(track.id, {
							crossfade: {
								targetTrackId: targetId,
								durationMs: track.crossfade?.durationMs ?? 100,
							},
						});
					}
				}}
			>
				<SelectTrigger
					className="h-6 text-xs w-full"
					aria-label="Crossfade target"
				>
					<SelectValue placeholder="No crossfade" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="">No crossfade</SelectItem>
					{otherTracks.map((ot) => (
						<SelectItem key={ot.id} value={ot.id}>
							{ot.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{track.crossfade && (
				<Slider
					min={10}
					max={500}
					step={10}
					value={[track.crossfade.durationMs]}
					onValueChange={([v]) => {
						if (!track.crossfade) {
							return;
						}
						updateTrack(track.id, {
							crossfade: { ...track.crossfade, durationMs: v },
						});
					}}
					className="w-full h-4"
					aria-label="Crossfade duration"
				/>
			)}
		</div>
	);
}

export function TrackControlsColumn({
	track,
	showAutomation,
	showPlugins,
	setShowPlugins,
	showCrossfade,
	setShowCrossfade,
	otherTracks,
	channelsCount,
	trackAnalysers,
	groups,
	onMute,
	onSolo,
	onVolume,
	onPan,
	onAddAutomation,
	onAddPanAutomation,
	onClearAutomation,
	updateTrack,
	onTranscribe,
	onAssignGroup,
}: {
	track: StudioTrack;
	showAutomation: boolean;
	showPlugins: boolean;
	setShowPlugins: (v: boolean) => void;
	showCrossfade: boolean;
	setShowCrossfade: (v: boolean) => void;
	otherTracks: StudioTrack[];
	channelsCount: number;
	trackAnalysers: Map<string, AnalyserNode>;
	groups: Array<{ id: string; name: string }>;
	onMute: () => void;
	onSolo: () => void;
	onVolume: (v: number) => void;
	onPan: (pan: number) => void;
	onAddAutomation: () => void;
	onAddPanAutomation: () => void;
	onClearAutomation: () => void;
	updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
	onTranscribe: () => void;
	onAssignGroup: (trackId: string, groupId: string | null) => void;
}) {
	return (
		<div className="flex w-24 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-card px-2 py-1.5">
			<TrackIdentity track={track} />
			{track.midiNotes.length > 0 && (
				<span className="text-[8px] text-accent font-semibold">MIDI</span>
			)}
			{channelsCount > 2 && (
				<span className="text-[8px] text-muted-foreground/50">
					{channelsCount}ch
				</span>
			)}
			{groups.length > 0 && (
				<Select
					value={track.groupId ?? ""}
					onValueChange={(v) => onAssignGroup(track.id, v || null)}
				>
					<SelectTrigger
						className="h-4 text-[8px] w-full"
						aria-label="Track group"
					>
						<SelectValue placeholder="No group" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">No group</SelectItem>
						{groups.map((g) => (
							<SelectItem key={g.id} value={g.id}>
								{g.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			<TrackMuteSolo track={track} onMute={onMute} onSolo={onSolo} />
			<div className="flex items-center gap-1 h-8">
				<Slider
					min={0}
					max={1}
					step={0.01}
					value={[track.volume]}
					onValueChange={([v]) => onVolume(v)}
					className="h-8 [&>div]:h-full [&>div]:flex-col [&>div]:items-center flex-1"
					aria-label={`${track.name} volume`}
				/>
				<TrackMeter analyser={trackAnalysers.get(track.id) ?? null} />
			</div>
			<TrackPan track={track} onPan={onPan} />
			<TrackToolButtons
				track={track}
				showAutomation={showAutomation}
				showPlugins={showPlugins}
				setShowPlugins={setShowPlugins}
				showCrossfade={showCrossfade}
				setShowCrossfade={setShowCrossfade}
				otherTracks={otherTracks}
				onAddAutomation={onAddAutomation}
				onAddPanAutomation={onAddPanAutomation}
				onClearAutomation={onClearAutomation}
				updateTrack={updateTrack}
				onTranscribe={onTranscribe}
			/>
			{showCrossfade && (
				<TrackCrossfadeControls
					track={track}
					showCrossfade={showCrossfade}
					updateTrack={updateTrack}
				/>
			)}
			<span className="text-xs font-mono tabular-nums text-muted-foreground">
				{track.duration
					? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, "0")}`
					: "0:00"}
			</span>
		</div>
	);
}
