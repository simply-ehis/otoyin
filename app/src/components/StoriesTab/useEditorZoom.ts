import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseEditorZoomArgs {
	tracksRef: RefObject<HTMLDivElement | null>;
	pixelsPerSecond: number;
	setPixelsPerSecond: React.Dispatch<React.SetStateAction<number>>;
	containerWidth: number;
	totalDurationMs: number;
	minPps: number;
	maxPps: number;
	timelineWidth: number;
}

export function useEditorZoom({
	tracksRef,
	pixelsPerSecond,
	setPixelsPerSecond,
	containerWidth,
	totalDurationMs,
	minPps,
	maxPps,
	timelineWidth,
}: UseEditorZoomArgs) {
	const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
	const [scrollbarTrackWidth, setScrollbarTrackWidth] = useState(0);
	const scrollbarTrackRef = useRef<HTMLDivElement>(null);
	const scrollbarDragRef = useRef<{
		mode: "pan" | "left" | "right";
		startX: number;
		startScrollLeft: number;
		startPixelsPerSecond: number;
	} | null>(null);
	// Anchor the visible left/right edge time during a zoom drag so the edge
	// the user isn't dragging stays pinned in place across pixelsPerSecond changes.
	const zoomAnchorRef = useRef<{
		type: "left" | "right";
		timeMs: number;
	} | null>(null);

	// Mirror the timeline's scrollLeft into state so the scrollbar thumb tracks it
	useEffect(() => {
		const el = tracksRef.current;
		if (!el) {
			return;
		}
		const onScroll = () => setTimelineScrollLeft(el.scrollLeft);
		el.addEventListener("scroll", onScroll);
		setTimelineScrollLeft(el.scrollLeft);
		return () => el.removeEventListener("scroll", onScroll);
	}, [tracksRef]);

	// Track scrollbar track width for thumb sizing
	useEffect(() => {
		const el = scrollbarTrackRef.current;
		if (!el) {
			return;
		}
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setScrollbarTrackWidth(entry.contentRect.width);
			}
		});
		ro.observe(el);
		setScrollbarTrackWidth(el.clientWidth);
		return () => ro.disconnect();
	}, []);

	// After a zoom drag updates pixelsPerSecond, snap scrollLeft so the anchored
	// edge (left or right of the visible window) stays at the same time.
	useEffect(() => {
		const anchor = zoomAnchorRef.current;
		if (!anchor || !tracksRef.current) {
			return;
		}
		const timePx = (anchor.timeMs / 1000) * pixelsPerSecond;
		tracksRef.current.scrollLeft =
			anchor.type === "left"
				? Math.max(0, timePx)
				: Math.max(0, timePx - containerWidth);
	}, [pixelsPerSecond, containerWidth, tracksRef]);

	// Scrollbar thumb geometry
	const maxTimelineScroll = Math.max(0, timelineWidth - containerWidth);
	const visibleRatio =
		timelineWidth > 0 ? Math.min(1, containerWidth / timelineWidth) : 1;
	const thumbWidth = Math.max(24, visibleRatio * scrollbarTrackWidth);
	const thumbRange = Math.max(0, scrollbarTrackWidth - thumbWidth);
	const thumbLeft =
		maxTimelineScroll > 0 && thumbRange > 0
			? (timelineScrollLeft / maxTimelineScroll) * thumbRange
			: 0;
	const canScrollHorizontally = maxTimelineScroll > 0;

	const handleScrollbarMouseDown = useCallback(
		(mode: "pan" | "left" | "right") => (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			scrollbarDragRef.current = {
				mode,
				startX: e.clientX,
				startScrollLeft: timelineScrollLeft,
				startPixelsPerSecond: pixelsPerSecond,
			};
		},
		[timelineScrollLeft, pixelsPerSecond],
	);

	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			const drag = scrollbarDragRef.current;
			if (!drag || !tracksRef.current) {
				return;
			}
			const deltaX = e.clientX - drag.startX;

			if (drag.mode === "pan") {
				if (thumbRange <= 0) {
					return;
				}
				const deltaScroll = (deltaX / thumbRange) * maxTimelineScroll;
				tracksRef.current.scrollLeft = Math.max(
					0,
					Math.min(maxTimelineScroll, drag.startScrollLeft + deltaScroll),
				);
				return;
			}

			if (scrollbarTrackWidth <= 0 || containerWidth <= 0) {
				return;
			}

			// Recompute the thumb width that corresponded to the drag start, then
			// apply the mouse delta to the dragged edge.
			const startTimelinePx =
				(totalDurationMs / 1000) * drag.startPixelsPerSecond + 200;
			const startThumbWidth = Math.max(
				30,
				Math.min(
					scrollbarTrackWidth,
					(containerWidth / startTimelinePx) * scrollbarTrackWidth,
				),
			);
			const newThumbWidth = Math.max(
				30,
				Math.min(
					scrollbarTrackWidth,
					drag.mode === "right"
						? startThumbWidth + deltaX
						: startThumbWidth - deltaX,
				),
			);

			const newTimelinePx =
				(containerWidth / newThumbWidth) * scrollbarTrackWidth;
			const rawPps = (newTimelinePx - 200) / (totalDurationMs / 1000);
			const newPps = Math.max(minPps, Math.min(maxPps, rawPps));

			zoomAnchorRef.current =
				drag.mode === "right"
					? {
							type: "left",
							timeMs: (drag.startScrollLeft / drag.startPixelsPerSecond) * 1000,
						}
					: {
							type: "right",
							timeMs:
								((drag.startScrollLeft + containerWidth) /
									drag.startPixelsPerSecond) *
								1000,
						};

			setPixelsPerSecond(newPps);
		};
		const onMouseUp = () => {
			scrollbarDragRef.current = null;
			zoomAnchorRef.current = null;
		};
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [
		maxTimelineScroll,
		thumbRange,
		scrollbarTrackWidth,
		containerWidth,
		totalDurationMs,
		minPps,
		maxPps,
		setPixelsPerSecond,
		tracksRef,
	]);

	return {
		scrollbarTrackRef,
		thumbWidth,
		thumbLeft,
		canScrollHorizontally,
		handleScrollbarMouseDown,
	} as const;
}
