import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StoryItemDetail } from "@/lib/api/types";
import {
	DEFAULT_VISIBLE_SECONDS,
	FALLBACK_PIXELS_PER_SECOND,
	LABEL_COL_WIDTH,
	MIN_VISIBLE_SECONDS,
} from "./timeline";

interface UseTimelineStateProps {
	items: StoryItemDetail[];
	containerWidth: number;
}

function getEffectiveDuration(item: StoryItemDetail) {
	return (
		item.duration * 1000 - (item.trim_start_ms || 0) - (item.trim_end_ms || 0)
	);
}

export function useTimelineState({
	items,
	containerWidth,
}: UseTimelineStateProps) {
	const [pixelsPerSecond, setPixelsPerSecond] = useState(
		FALLBACK_PIXELS_PER_SECOND,
	);
	const hasAppliedDefaultZoomRef = useRef(false);

	const totalDurationMs = useMemo(() => {
		if (items.length === 0) {
			return 10000;
		}
		return Math.max(
			...items.map((item) => item.start_time_ms + getEffectiveDuration(item)),
			10000,
		);
	}, [items]);

	const visibleTrackWidth = Math.max(0, containerWidth - LABEL_COL_WIDTH);
	const projectSeconds = totalDurationMs / 1000;

	const { minPps, maxPps } = useMemo(() => {
		if (visibleTrackWidth <= 0 || projectSeconds <= 0) {
			return { minPps: 10, maxPps: 200 };
		}
		const min = visibleTrackWidth / projectSeconds;
		const max = visibleTrackWidth / MIN_VISIBLE_SECONDS;
		return { minPps: min, maxPps: Math.max(max, min) };
	}, [visibleTrackWidth, projectSeconds]);

	useEffect(() => {
		if (hasAppliedDefaultZoomRef.current) {
			return;
		}
		if (visibleTrackWidth <= 0) {
			return;
		}
		const defaultScope = Math.min(
			DEFAULT_VISIBLE_SECONDS,
			Math.max(projectSeconds, MIN_VISIBLE_SECONDS),
		);
		setPixelsPerSecond(visibleTrackWidth / defaultScope);
		hasAppliedDefaultZoomRef.current = true;
	}, [visibleTrackWidth, projectSeconds]);

	useEffect(() => {
		setPixelsPerSecond((prev) => Math.max(minPps, Math.min(maxPps, prev)));
	}, [minPps, maxPps]);

	const contentWidth = (totalDurationMs / 1000) * pixelsPerSecond + 200;
	const timelineWidth = Math.max(contentWidth, containerWidth);

	const timeMarkers = useMemo(() => {
		const markers: number[] = [];
		let intervalMs = 5000;
		if (pixelsPerSecond > 100) {
			intervalMs = 1000;
		} else if (pixelsPerSecond > 50) {
			intervalMs = 2000;
		} else if (pixelsPerSecond < 20) {
			intervalMs = 10000;
		}
		for (let ms = 0; ms <= totalDurationMs + intervalMs; ms += intervalMs) {
			markers.push(ms);
		}
		return markers;
	}, [totalDurationMs, pixelsPerSecond]);

	const msToPixels = useCallback(
		(ms: number) => (ms / 1000) * pixelsPerSecond,
		[pixelsPerSecond],
	);

	const pixelsToMs = useCallback(
		(px: number) => (px / pixelsPerSecond) * 1000,
		[pixelsPerSecond],
	);

	return {
		pixelsPerSecond,
		setPixelsPerSecond,
		totalDurationMs,
		minPps,
		maxPps,
		timelineWidth,
		timeMarkers,
		msToPixels,
		pixelsToMs,
	};
}
