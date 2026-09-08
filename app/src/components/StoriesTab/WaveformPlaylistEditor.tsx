import { WaveformPlaylistProvider } from "@waveform-playlist/browser";
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { StoryItemDetail } from "@/lib/api/types";
import { debug } from "@/lib/utils/debug";
import { TrackLabelCell } from "./TrackLabelCell";
import { TRACK_HEIGHT } from "./timeline";
import { WaveformPlaylistStage } from "./WaveformPlaylistStage";
import {
	buildClipTracks,
	decodeClipAudio,
	hslFromToken,
	type PlaylistZoomHandle,
	ppsToSamplesPerPixel,
	ZOOM_LADDER_SPP,
} from "./waveformPlaylist";

interface WaveformPlaylistEditorProps {
	storyId: string;
	items: StoryItemDetail[];
	/** Otoyin zoom, pixels-per-second (snapped onto the playlist ladder). */
	pixelsPerSecond: number;
	/** Report engine-driven zoom back to otoyin's pps state. */
	onPixelsPerSecondChange: (pps: number) => void;
	/** Otoyin playhead position in ms (useStoryStore.currentTimeMs). */
	currentTimeMs: number;
	/** Track numbers top→bottom (already sorted by StoryTrackEditor). */
	tracks: number[];
	selectedClipId: string | null;
	onSelectClip: (id: string | null) => void;
	/** Seek otoyin's store (ms) when the user clicks empty timeline. */
	onSeekMs: (timeMs: number) => void;
	/** Commit a moved clip through otoyin's React-Query mutation. */
	onMoveItem: (itemId: string, startTimeMs: number, track: number) => void;
	/** Mute/solo per track index (useStoryStore.trackConfigs). */
	trackMutes: boolean[];
	trackSolos: boolean[];
	/** Add-track callbacks (label column buttons). */
	onAddTrackAbove: () => void;
	onAddTrackBelow: () => void;
	/** Trim drag lifecycle from useStoryTrim (preview values while dragging). */
	trimmingItem: string | null;
	tempTrimValues: { trim_start_ms: number; trim_end_ms: number } | null;
	/** Starts a trim drag through otoyin's useStoryTrim. */
	onTrimStart: (
		e: React.MouseEvent,
		item: StoryItemDetail,
		side: "start" | "end",
	) => void;
	/** Crossfade handles (otoyin's CrossfadeHandles, geometry precomputed). */
	crossfadeHandles: ReactNode;
	/** Automation overlay lanes, absolutely positioned per track. */
	automationOverlay: ReactNode;
	/**
	 * Receives the playlist's own scroll container once mounted, so otoyin's
	 * zoom-anchor/scrollbar helpers keep driving the real scroller.
	 */
	onScrollerRef?: (el: HTMLDivElement | null) => void;
}

/**
 * Imperative zoom controls StoryTrackEditor's toolbar drives.
 * Defined in waveformPlaylist.ts; re-exported for the wired owner.
 */
export type { PlaylistZoomHandle } from "./waveformPlaylist";

/**
 * Outer adapter: decodes audio, builds playlist tracks, hosts the provider.
 *
 * Authority split (docs/reports/2026-09-05-media-stack-research.md):
 * playlist = peak rendering + clip geometry + timescale + ladder zoom;
 * otoyin = playback (engine is silent), selection store, backend mutations,
 * keyboard shortcuts, crossfades. The playlist's own drag system is NOT
 * used: its engine constrains clip moves to forbid overlaps, while otoyin's
 * crossfades REQUIRE them. Pointer events flow through the stage's bridge
 * instead, which keeps backend authority.
 */
export function WaveformPlaylistEditor(
	props: WaveformPlaylistEditorProps & {
		zoomHandleRef?: RefObject<PlaylistZoomHandle | null>;
	},
) {
	const { items, tracks, trackMutes, trackSolos } = props;

	const [bufferMap, setBufferMap] = useState<Map<string, AudioBuffer>>(
		() => new Map(),
	);
	const ctxRef = useRef<AudioContext | null>(null);
	const [loadingCount, setLoadingCount] = useState(0);

	// Shared AudioContext at the timeline rate so clip.sampleRate equals the
	// engine's timeline rate — the engine converts samples↔seconds per-clip
	// via clip.sampleRate, so mixed rates would misplace clips.
	const getCtx = useCallback(() => {
		if (!ctxRef.current) {
			ctxRef.current = new AudioContext({ sampleRate: 48000 });
		}
		return ctxRef.current;
	}, []);

	useEffect(() => {
		return () => {
			void ctxRef.current?.close();
			ctxRef.current = null;
		};
	}, []);

	const bufferMapRef = useRef(bufferMap);
	bufferMapRef.current = bufferMap;

	// Decode all clip audio for this story. bufferMap is intentionally not a
	// dependency: the cache is read opportunistically via ref so a re-run
	// never re-decodes buffers already in the map.
	useEffect(() => {
		if (items.length === 0) {
			setBufferMap(new Map());
			setLoadingCount(0);
			return;
		}
		let cancelled = false;
		setLoadingCount(items.length);
		void (async () => {
			const ctx = getCtx();
			const next = new Map<string, AudioBuffer>();
			for (const item of items) {
				const cached = bufferMapRef.current.get(item.generation_id);
				if (cached) {
					next.set(item.generation_id, cached);
					continue;
				}
				const buffer = await decodeClipAudio(item, ctx);
				if (cancelled) {
					return;
				}
				if (buffer) {
					next.set(item.generation_id, buffer);
				} else {
					debug.warn(
						`[stories] audio decode failed for generation ${item.generation_id}`,
					);
				}
			}
			if (!cancelled) {
				setBufferMap(next);
				setLoadingCount(0);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [items, getCtx]);

	const playlistTracks = useMemo(() => {
		if (items.length === 0) {
			return [];
		}
		const built = buildClipTracks(items, bufferMap, tracks);
		return built.map((track, index) => ({
			...track,
			muted: trackMutes[index] ?? false,
			soloed: trackSolos[index] ?? false,
		}));
	}, [items, bufferMap, tracks, trackMutes, trackSolos]);

	const theme = useMemo(
		() => ({
			waveOutlineColor: hslFromToken("--accent"),
			waveFillColor: hslFromToken("--accent"),
			waveProgressColor: hslFromToken("--accent"),
			selectionColor: hslFromToken("--primary"),
			backgroundColor: hslFromToken("--card"),
			borderColor: hslFromToken("--border"),
			textColor: hslFromToken("--foreground"),
			textColorMuted: hslFromToken("--muted-foreground"),
			timescaleBackgroundColor: hslFromToken("--card"),
			timeColor: hslFromToken("--muted-foreground"),
		}),
		[],
	);

	// The engine requires the INITIAL samplesPerPixel to be an exact zoomLevels
	// member (verified: PlaylistEngine constructor throws otherwise). Snap once
	// here; the stage bridges later otoyin-driven changes via setZoomLevel.
	// biome-ignore lint/correctness/useExhaustiveDependencies: initial-only snap — the stage bridges later zoom changes via setZoomLevel
	const initialSpp = useMemo(
		() => ppsToSamplesPerPixel(props.pixelsPerSecond),
		[],
	);

	if (loadingCount > 0) {
		return (
			<div className="flex items-center justify-center h-full text-sm text-muted-foreground">
				Loading audio… {loadingCount} clip{loadingCount === 1 ? "" : "s"}{" "}
				remaining
			</div>
		);
	}

	return (
		<div className="flex overflow-hidden relative">
			{/* Otoyin label column — flex sibling of the playlist's scroller. */}
			<div className="w-16 shrink-0 relative z-20">
				<TrackLabelCell
					index={-1}
					isFirst={false}
					isLast={false}
					isTimescaleSpacer
					onAddTrackAbove={props.onAddTrackAbove}
					onAddTrackBelow={props.onAddTrackBelow}
				/>
				{tracks.map((trackNumber, index) => (
					<TrackLabelCell
						key={trackNumber}
						index={index}
						isFirst={index === 0}
						isLast={index === tracks.length - 1}
						onAddTrackAbove={props.onAddTrackAbove}
						onAddTrackBelow={props.onAddTrackBelow}
					/>
				))}
			</div>
			<div className="flex-1 min-w-0">
				<WaveformPlaylistProvider
					tracks={playlistTracks}
					samplesPerPixel={initialSpp}
					zoomLevels={[...ZOOM_LADDER_SPP]}
					waveHeight={TRACK_HEIGHT}
					mono
					timescale
					automaticScroll={false}
					fillViewport
					theme={theme}
					onError={(err: unknown) =>
						debug.warn("[stories] playlist error:", err)
					}
				>
					<WaveformPlaylistStage {...props} />
				</WaveformPlaylistProvider>
			</div>
		</div>
	);
}
