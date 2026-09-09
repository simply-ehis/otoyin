import { DocumentTextIcon as Document } from "@heroicons/react/24/outline";
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

export function TrackIdentity({ track }: { track: StudioTrack }) {
	return (
		<span className="text-xs font-medium text-foreground truncate w-full text-center">
			{track.name}
		</span>
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
						aria-label="Add keyframe"
						className="px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97] bg-muted text-muted-foreground hover:bg-secondary"
						onClick={onAddAutomation}
						title="Add keyframe at current time"
					>
						K+
					</button>
					{(track.volumeAutomation ?? []).length > 0 && (
						<button
							type="button"
							aria-label="Clear automation"
							className="px-1.5 py-0.5 text-xs font-bold rounded transition-colors active:scale-[0.97] bg-danger-soft text-danger-text [@media(hover:hover)]:hover:brightness-110"
							onClick={onClearAutomation}
							title="Clear automation"
						>
							Kx
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
	onMute,
	onSolo,
	onVolume,
	onPan,
	onAddAutomation,
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
	channelsCount: number;
	trackAnalysers: Map<string, AnalyserNode>;
	onMute: () => void;
	onSolo: () => void;
	onVolume: (v: number) => void;
	onPan: (pan: number) => void;
	onAddAutomation: () => void;
	onClearAutomation: () => void;
	updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
	onTranscribe: () => void;
}) {
	return (
		<div className="flex w-24 shrink-0 flex-col items-center gap-1 border-r border-border bg-card p-2">
			<TrackIdentity track={track} />
			{track.midiNotes.length > 0 && (
				<span className="text-[8px] text-accent font-semibold">MIDI</span>
			)}
			{channelsCount > 2 && (
				<span className="text-[8px] text-muted-foreground/50">
					{channelsCount}ch
				</span>
			)}
			<TrackMuteSolo track={track} onMute={onMute} onSolo={onSolo} />
			<div className="flex items-center gap-1 h-12">
				<Slider
					min={0}
					max={1}
					step={0.01}
					value={[track.volume]}
					onValueChange={([v]) => onVolume(v)}
					className="h-12 [&>div]:h-full [&>div]:flex-col [&>div]:items-center flex-1"
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
