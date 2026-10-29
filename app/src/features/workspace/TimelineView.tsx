import {
	ArrowUpTrayIcon,
	BackwardIcon,
	PauseIcon,
	PlayIcon,
	PlusIcon,
	SignalIcon,
	SpeakerWaveIcon,
	StopIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPeakWaveform } from "@/features/audioStudio/getPeakWaveform";
import { getClip } from "@/lib/clip";
import { useHistory } from "@/lib/hooks/useHistory";
import { formatAudioDuration } from "@/lib/utils/audio";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";
import { Button } from "@/ui/button";
import { Slider } from "@/ui/slider";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { ImportModal } from "./ImportModal";

interface Track {
	id: string;
	name: string;
	muted: boolean;
	solo: boolean;
	volume: number;
	audioUrl?: string;
	duration?: number;
	peaks?: number[];
}

function clock(totalSeconds: number): string {
	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds - m * 60;
	return `${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

/**
 * Session timeline: transport bound to the shared player, history
 * generations as tracks, clip paste, media import. Track bars are
 * proportional to real durations — never decorative random data.
 */
export function TimelineView() {
	const navigate = useNavigate();
	const { toast } = useToast();
	const [tracks, setTracks] = useState<Track[]>([]);
	const [zoom, setZoom] = useState(1);
	const [importOpen, setImportOpen] = useState(false);

	const isPlaying = usePlayerStore((s) => s.isPlaying);
	const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
	const currentTime = usePlayerStore((s) => s.currentTime);
	const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
	const duration = usePlayerStore((s) => s.duration);
	const volume = usePlayerStore((s) => s.volume);
	const setVolume = usePlayerStore((s) => s.setVolume);

	const { data: history } = useHistory({ limit: 20 });

	useEffect(() => {
		if (history?.items) {
			const base = history.items.map((gen) => ({
				id: gen.id,
				name: gen.text.slice(0, 40) || "Untitled",
				muted: false,
				solo: false,
				volume: 0.75,
				audioUrl: gen.audio_path,
				duration: gen.duration,
			}));
			setTracks(base);
			// Load waveform peaks asynchronously for each track.
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
	}, [history?.items]);

	const playTrack = (track: Track) => {
		if (!track.audioUrl) {
			return;
		}
		const { setAudioWithAutoPlay, setIsPlaying: setStorePlaying } =
			usePlayerStore.getState();
		setAudioWithAutoPlay(track.audioUrl, track.id, null, track.name);
		setStorePlaying(true);
	};

	const togglePlay = () => {
		const first = tracks.find((t) => t.audioUrl);
		if (!isPlaying && first?.audioUrl && !usePlayerStore.getState().audioUrl) {
			playTrack(first);
			return;
		}
		setIsPlaying(!isPlaying);
	};

	const pasteClip = async () => {
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
			},
		]);
		toast({ title: `Pasted "${clip.name}" as new track` });
	};

	const maxDuration = Math.max(1, ...tracks.map((t) => t.duration ?? 0));

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
			<ScreenHeader title="Timeline" />

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
			) : null}

			<div
				role="img"
				aria-label={`${tracks.length} tracks, ${formatAudioDuration(maxDuration)} total`}
				className="flex h-40 items-end gap-1 overflow-hidden rounded-md border border-border bg-card p-3"
			>
				{tracks.length === 0 ? (
					<p className="m-auto text-xs text-muted-foreground/60">
						Session overview appears here
					</p>
				) : (
					tracks.map((t) => (
						<div
							key={t.id}
							title={`${t.name} — ${t.duration ? formatAudioDuration(t.duration) : "unknown length"}`}
							className={cn(
								"min-w-[3px] flex-1 rounded-full",
								t.muted ? "bg-strong" : "bg-accent",
							)}
							style={{
								height: `${Math.max(6, ((t.duration ?? 0) / maxDuration) * 100)}%`,
								opacity: t.muted
									? 0.5
									: 0.35 + 0.65 * ((t.duration ?? 0) / maxDuration),
							}}
						/>
					))
				)}
			</div>

			<div className="flex items-center gap-2">
				<span className="text-xs tabular-nums text-muted-foreground">
					Position
				</span>
				<Slider
					value={[Math.min(currentTime, duration || 0)]}
					max={Math.max(duration || 0, 1)}
					step={0.1}
					onValueChange={([v]) => setCurrentTime(v ?? 0)}
					aria-label="Seek"
					className="flex-1"
				/>
				<span className="min-w-[80px] text-right font-mono text-xs tabular-nums text-foreground">
					{clock(currentTime)}
				</span>
			</div>

			<div className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-2">
				<Button
					variant="ghost"
					size="icon"
					className="size-8"
					title="Skip to start"
					aria-label="Skip to start"
					onClick={() => setCurrentTime(0)}
				>
					<BackwardIcon className="size-4" aria-hidden="true" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-8"
					title={isPlaying ? "Pause" : "Play"}
					aria-label={isPlaying ? "Pause" : "Play"}
					onClick={togglePlay}
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
					className="size-8"
					title="Stop"
					aria-label="Stop"
					onClick={() => {
						setIsPlaying(false);
						setCurrentTime(0);
					}}
				>
					<StopIcon className="size-4" aria-hidden="true" />
				</Button>
				<span className="ml-auto flex items-center gap-2">
					<SpeakerWaveIcon
						className="size-4 text-muted-foreground"
						aria-hidden="true"
					/>
					<Slider
						value={[volume]}
						max={1}
						step={0.05}
						onValueChange={([v]) => setVolume(v ?? volume)}
						aria-label="Monitor volume"
						className="w-20"
					/>
				</span>
				<span className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">Zoom</span>
					<Slider
						value={[zoom]}
						min={0.5}
						max={3}
						step={0.25}
						onValueChange={([v]) => setZoom(v ?? 1)}
						aria-label="Timeline zoom"
						className="w-20"
					/>
				</span>
			</div>

			<ImportModal open={importOpen} onOpenChange={setImportOpen} />

			<ul className="divide-y divide-border overflow-y-auto rounded-md border border-border bg-card">
				{tracks.map((track) => (
					<li key={track.id}>
						<div className="flex items-center gap-3 px-3 py-2">
							<button
								type="button"
								onClick={() => playTrack(track)}
								disabled={!track.audioUrl}
								aria-label={`Play ${track.name}`}
								className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
							>
								<span className="block truncate text-xs font-medium text-foreground">
									{track.name}
								</span>
								{track.duration ? (
									<span className="block font-mono text-xs tabular-nums text-muted-foreground">
										{formatAudioDuration(track.duration)}
									</span>
								) : null}
							</button>
							<button
								type="button"
								title={track.muted ? "Unmute track" : "Mute track"}
								aria-label={`${track.muted ? "Unmute" : "Mute"} ${track.name}`}
								aria-pressed={track.muted}
								onClick={() =>
									setTracks((prev) =>
										prev.map((x) =>
											x.id === track.id ? { ...x, muted: !x.muted } : x,
										),
									)
								}
								className={cn(
									"rounded-sm px-2 py-0.5 text-xs font-semibold transition-colors",
									track.muted
										? "bg-warning text-warning-foreground"
										: "bg-secondary text-muted-foreground hover:text-foreground",
								)}
							>
								M
							</button>
							<button
								type="button"
								title={track.solo ? "Unsolo track" : "Solo track"}
								aria-label={`${track.solo ? "Unsolo" : "Solo"} ${track.name}`}
								aria-pressed={track.solo}
								onClick={() =>
									setTracks((prev) =>
										prev.map((x) =>
											x.id === track.id ? { ...x, solo: !x.solo } : x,
										),
									)
								}
								className={cn(
									"rounded-sm px-2 py-0.5 text-xs font-semibold transition-colors",
									track.solo
										? "bg-info text-info-foreground"
										: "bg-secondary text-muted-foreground hover:text-foreground",
								)}
							>
								S
							</button>
							<SpeakerWaveIcon
								className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
