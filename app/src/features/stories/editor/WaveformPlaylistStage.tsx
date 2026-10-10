import {
	PlaylistVisualization,
	usePlaylistControls,
	usePlaylistData,
} from "@waveform-playlist/browser";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import type { StoryItemDetail } from "@/lib/api/types";
import { TRACK_HEIGHT } from "./timeline";
import { usePlaylistPointerBridge } from "./usePlaylistPointerBridge";
import type { PlaylistZoomHandle } from "./waveformPlaylist";
import {
	PLAYLIST_TIMESCALE_HEIGHT,
	ppsToSamplesPerPixel,
	samplesPerPixelToPps,
} from "./waveformPlaylist";

interface WaveformPlaylistStageProps {
	items: StoryItemDetail[];
	currentTimeMs: number;
	tracks: number[];
	selectedClipId: string | null;
	onSelectClip: (id: string | null) => void;
	onSeekMs: (timeMs: number) => void;
	onMoveItem: (itemId: string, startTimeMs: number, track: number) => void;
	trackMutes: boolean[];
	trackSolos: boolean[];
	pixelsPerSecond: number;
	onPixelsPerSecondChange: (pps: number) => void;
	/** Populated with the playlist context's ladder zoom (toolbar buttons). */
	zoomHandleRef?: RefObject<PlaylistZoomHandle | null>;
	trimmingItem: string | null;
	tempTrimValues: { trim_start_ms: number; trim_end_ms: number } | null;
	onTrimStart: (
		e: React.MouseEvent,
		item: StoryItemDetail,
		side: "start" | "end",
	) => void;
	crossfadeHandles: ReactNode;
	automationOverlay: ReactNode;
	onScrollerRef?: (el: HTMLDivElement | null) => void;
}

/**
 * Inner stage: lives inside the provider so it reads the playlist contexts.
 * Renders the visualization plus otoyin's overlays in a scroll-synced
 * sibling plane (translateX mirroring the library scroller's scrollLeft).
 *
 * All overlay geometry uses the ENGINE-snapped pixels-per-second so it
 * matches waveform pixel positions exactly; otoyin's continuous pps is
 * mirrored from the engine, and otoyin-driven zoom changes are pushed into
 * the engine via setZoomLevel (ladder-snapped).
 */
export function WaveformPlaylistStage(props: WaveformPlaylistStageProps) {
	const {
		items,
		currentTimeMs,
		tracks,
		selectedClipId,
		onSelectClip,
		onSeekMs,
		onMoveItem,
		trackMutes,
		trackSolos,
		pixelsPerSecond,
		onPixelsPerSecondChange,
		zoomHandleRef,
		trimmingItem,
		tempTrimValues,
		onTrimStart,
		crossfadeHandles,
		automationOverlay,
		onScrollerRef,
	} = props;
	const { samplesPerPixel, sampleRate, isReady, duration, playoutRef } =
		usePlaylistData();
	const { setTrackMute, setTrackSolo, zoomIn, zoomOut } = usePlaylistControls();

	// Expose ladder zoom to StoryTrackEditor's toolbar (zoomHandleRef is a
	// mutable ref, so the handlers below are read fresh at call time).
	useEffect(() => {
		if (zoomHandleRef) {
			zoomHandleRef.current = {
				zoomIn: () => zoomIn(),
				zoomOut: () => zoomOut(),
			};
		}
		return () => {
			if (zoomHandleRef) {
				zoomHandleRef.current = null;
			}
		};
	}, [zoomHandleRef, zoomIn, zoomOut]);

	// Engine-snapped zoom — the single pps authority for overlay geometry.
	const enginePps = samplesPerPixelToPps(samplesPerPixel);

	// Push otoyin mute/solo into the engine (visualization only; engine silent).
	useEffect(() => {
		tracks.forEach((_, index) => {
			setTrackMute(index, trackMutes[index] ?? false);
			setTrackSolo(index, trackSolos[index] ?? false);
		});
	}, [tracks, trackMutes, trackSolos, setTrackMute, setTrackSolo]);

	// Mirror engine zoom back to otoyin's continuous pps state.
	useEffect(() => {
		if (
			Number.isFinite(enginePps) &&
			Math.abs(enginePps - pixelsPerSecond) > 0.25
		) {
			onPixelsPerSecondChange(enginePps);
		}
	}, [enginePps, pixelsPerSecond, onPixelsPerSecondChange]);

	// Otoyin-driven zoom: snap the engine ladder to otoyin's target when it
	// crosses to a different rung (scrollbar drag, fit defaults).
	const lastPushedSppRef = useRef(samplesPerPixel);
	useEffect(() => {
		const engine = playoutRef.current;
		if (!engine || !isReady) {
			return;
		}
		const targetSpp = ppsToSamplesPerPixel(pixelsPerSecond);
		if (targetSpp !== lastPushedSppRef.current) {
			lastPushedSppRef.current = targetSpp;
			engine.setZoomLevel(targetSpp);
		}
	}, [pixelsPerSecond, playoutRef, isReady]);

	// ---- Scroll sync -------------------------------------------------------
	// The library's [data-scroll-container] is the only horizontal scroller;
	// the overlay plane mirrors its scrollLeft via transform.
	const planeRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const plane = planeRef.current;
		if (!plane) {
			return;
		}
		const scroller = plane.parentElement?.querySelector(
			"[data-scroll-container]",
		);
		if (!scroller) {
			return;
		}
		const sync = () => {
			plane.style.transform = `translateX(${-scroller.scrollLeft}px)`;
		};
		sync();
		scroller.addEventListener("scroll", sync, { passive: true });
		// Expose the real scroller to otoyin's zoom/scrollbar helpers.
		if (onScrollerRef) {
			onScrollerRef(scroller as HTMLDivElement);
			return () => {
				scroller.removeEventListener("scroll", sync);
				onScrollerRef(null);
			};
		}
		return () => scroller.removeEventListener("scroll", sync);
	}, [onScrollerRef]);

	// ---- Pointer bridge ----------------------------------------------------
	usePlaylistPointerBridge({
		items,
		pixelsPerSecond: enginePps,
		tracks,
		onSelectClip,
		onSeekMs,
		onMoveItem,
		planeRef,
		stageMarker: "data-playlist-stage",
	});

	const stageWidth = isReady
		? Math.max(200, (duration * sampleRate) / samplesPerPixel)
		: 400;

	const trimOverlay = items.map((item) => {
		if (item.id !== selectedClipId) {
			return null;
		}
		const displayTrimStart =
			trimmingItem === item.id && tempTrimValues
				? tempTrimValues.trim_start_ms
				: item.trim_start_ms || 0;
		const displayTrimEnd =
			trimmingItem === item.id && tempTrimValues
				? tempTrimValues.trim_end_ms
				: item.trim_end_ms || 0;
		const speed = item.speed || 1;
		const spanMs =
			(item.duration * 1000 - displayTrimStart - displayTrimEnd) / speed;
		const leftPx = ((item.start_time_ms || 0) / 1000) * enginePps;
		const widthPx = Math.max(4, (spanMs / 1000) * enginePps);
		const trackIndex = tracks.indexOf(item.track);
		if (trackIndex === -1) {
			return null;
		}
		return (
			<div
				key={`trim-${item.id}`}
				className="absolute z-30 ring-2 ring-primary ring-offset-1 rounded"
				style={{
					left: `${leftPx}px`,
					width: `${widthPx}px`,
					top: `${trackIndex * TRACK_HEIGHT}px`,
					height: `${TRACK_HEIGHT}px`,
					pointerEvents: "none",
				}}
			>
				{" "}
				<button
					type="button"
					data-trim-handle=""
					className="trim-handle absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-strong hover:brightness-110 transition-[filter] rounded-l pointer-events-auto"
					onMouseDown={(e) => onTrimStart(e, item, "start")}
					aria-label="Trim start"
				/>
				<button
					type="button"
					data-trim-handle=""
					className="trim-handle absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-strong hover:brightness-110 transition-[filter] rounded-r pointer-events-auto"
					onMouseDown={(e) => onTrimStart(e, item, "end")}
					aria-label="Trim end"
				/>
			</div>
		);
	});

	return (
		<div className="relative" data-playlist-stage="">
			<PlaylistVisualization
				showFades
				showClipHeaders={false}
				interactiveClips={false}
				// Otoyin owns the playhead — suppress the built-in one.
				renderPlayhead={() => null}
			/>
			<div
				ref={planeRef}
				className="absolute top-0 left-0 pointer-events-none"
				style={{ width: `${stageWidth}px`, height: "100%" }}
			>
				<div
					className="absolute"
					style={{
						top: `${PLAYLIST_TIMESCALE_HEIGHT}px`,
						left: 0,
						width: "100%",
						height: `${tracks.length * TRACK_HEIGHT}px`,
					}}
				>
					{automationOverlay ? (
						// Re-enable hit testing for the interactive lanes (the plane
						// itself is pointer-events-none) and mark the layer so the
						// pointer bridge leaves automation presses alone.
						<div
							className="absolute inset-0 pointer-events-auto"
							data-automation-layer=""
						>
							{automationOverlay}
						</div>
					) : null}
					{crossfadeHandles}
					{trimOverlay}
					<div
						className="absolute top-0 bottom-0 w-1 bg-accent z-30 pointer-events-none rounded-full"
						style={{ left: `${(currentTimeMs / 1000) * enginePps}px` }}
					>
						<div className="absolute -top-1 left-1/2 -translate-x-1/2 size-3 bg-accent rounded-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
