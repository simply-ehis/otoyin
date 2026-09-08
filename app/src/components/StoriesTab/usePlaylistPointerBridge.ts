import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { StoryItemDetail } from "@/lib/api/types";
import { TRACK_HEIGHT } from "./timeline";
import { PLAYLIST_TIMESCALE_HEIGHT } from "./waveformPlaylist";

interface UsePlaylistPointerBridgeArgs {
	items: StoryItemDetail[];
	/** Engine-snapped pixels-per-second (matches waveform pixel geometry). */
	pixelsPerSecond: number;
	tracks: number[];
	onSelectClip: (id: string | null) => void;
	onSeekMs: (timeMs: number) => void;
	onMoveItem: (itemId: string, startTimeMs: number, track: number) => void;
	/** Hit-test surface — its rect already reflects the scroll transform. */
	planeRef: RefObject<HTMLDivElement | null>;
	/** Marker attribute for the capture layer (bridge ignores presses outside it). */
	stageMarker: string;
}

interface DragState {
	itemId: string;
	startClientX: number;
	startClientY: number;
	startTimeMs: number;
	moved: boolean;
}

/**
 * Pointer bridge between the waveform-playlist DOM and otoyin's mutations.
 *
 * Registered as a window CAPTURE mousedown listener scoped to the playlist
 * stage, so it runs before the library's own handlers: clip presses and
 * empty-space presses are stopped from ever reaching the library's
 * selection/drag system, while otoyin's own handles (trim, crossfade) are
 * let through untouched. The move-drag follows the pointer on window
 * listeners and commits through otoyin's React-Query mutation on release.
 *
 * The library's drag engine is deliberately not engaged: it constrains
 * clip moves to forbid overlaps, while otoyin's crossfades REQUIRE them.
 */
export function usePlaylistPointerBridge({
	items,
	pixelsPerSecond,
	tracks,
	onSelectClip,
	onSeekMs,
	onMoveItem,
	planeRef,
	stageMarker,
}: UsePlaylistPointerBridgeArgs) {
	const dragRef = useRef<DragState | null>(null);

	const timeAtClientX = useCallback(
		(clientX: number): number => {
			const plane = planeRef.current;
			if (!plane) {
				return 0;
			}
			const rect = plane.getBoundingClientRect();
			return Math.max(0, ((clientX - rect.left) / pixelsPerSecond) * 1000);
		},
		[planeRef, pixelsPerSecond],
	);

	const trackIndexAtClientY = useCallback(
		(clientY: number): number => {
			const plane = planeRef.current;
			if (!plane) {
				return 0;
			}
			const rect = plane.getBoundingClientRect();
			const y = clientY - rect.top - PLAYLIST_TIMESCALE_HEIGHT;
			return Math.max(
				0,
				Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)),
			);
		},
		[planeRef, tracks.length],
	);

	const timeAtEventX = useCallback(
		(e: MouseEvent) => timeAtClientX(e.clientX),
		[timeAtClientX],
	);

	const handleMove = useCallback((e: MouseEvent) => {
		const drag = dragRef.current;
		if (!drag) {
			return;
		}
		if (
			Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY) >
			4
		) {
			drag.moved = true;
		}
	}, []);

	const handleUp = useCallback(
		(e: MouseEvent) => {
			const drag = dragRef.current;
			dragRef.current = null;
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
			if (!drag || !drag.moved) {
				return;
			}
			const item = items.find((i) => i.id === drag.itemId);
			if (!item) {
				return;
			}
			const dtMs = ((e.clientX - drag.startClientX) / pixelsPerSecond) * 1000;
			const nextStartMs = Math.max(0, Math.round(drag.startTimeMs + dtMs));
			const trackIndex = trackIndexAtClientY(e.clientY);
			const nextTrack = tracks[trackIndex] ?? item.track;
			if (nextStartMs !== item.start_time_ms || nextTrack !== item.track) {
				onMoveItem(item.id, nextStartMs, nextTrack);
			}
		},
		[
			handleMove,
			items,
			onMoveItem,
			pixelsPerSecond,
			trackIndexAtClientY,
			tracks,
		],
	);

	useEffect(() => {
		const onMouseDown = (e: MouseEvent) => {
			if (e.button !== 0) {
				return;
			}
			const target = e.target as HTMLElement | null;
			if (!target?.closest(`[${stageMarker}]`)) {
				return;
			}
			// Let otoyin's own handles through untouched.
			if (
				target.closest("[data-trim-handle]") ||
				target.closest("[data-crossfade-handle]") ||
				target.closest("[data-automation-layer]")
			) {
				return;
			}
			const clipEl = target.closest("[data-clip-id]");
			const clipId = clipEl?.getAttribute("data-clip-id") ?? null;
			if (clipId && items.some((i) => i.id === clipId)) {
				e.stopImmediatePropagation();
				onSelectClip(clipId);
				const item = items.find((i) => i.id === clipId);
				if (!item) {
					return;
				}
				dragRef.current = {
					itemId: clipId,
					startClientX: e.clientX,
					startClientY: e.clientY,
					startTimeMs: item.start_time_ms,
					moved: false,
				};
				window.addEventListener("mousemove", handleMove);
				window.addEventListener("mouseup", handleUp);
				return;
			}
			// Empty space: deselect + seek, and keep the library inert.
			e.stopImmediatePropagation();
			onSelectClip(null);
			onSeekMs(timeAtEventX(e));
		};
		window.addEventListener("mousedown", onMouseDown, true);
		return () => {
			window.removeEventListener("mousedown", onMouseDown, true);
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, [
		items,
		onSelectClip,
		onSeekMs,
		timeAtEventX,
		handleMove,
		handleUp,
		stageMarker,
	]);
}
