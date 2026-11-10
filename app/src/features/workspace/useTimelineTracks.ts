import { useCallback, useRef, useState } from "react";
import {
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from "@dnd-kit/core";

/** Grid snap step, in seconds. */
export const SNAP_GRID_SECONDS = 1;
/** Base horizontal scale: pixels per second at zoom 1. */
export const PX_PER_SEC = 100;

export interface Track {
	id: string;
	name: string;
	muted: boolean;
	solo: boolean;
	volume: number;
	audioUrl?: string;
	duration?: number;
	/** Placement start on the timeline, seconds. */
	startTime: number;
	peaks?: number[];
}

/** Snap a time value to the active grid. Pure — safe to unit test. */
export function snapTime(seconds: number): number {
	return Math.round(seconds / SNAP_GRID_SECONDS) * SNAP_GRID_SECONDS;
}

/** Pixels per second for a given zoom factor. Pure — safe to unit test. */
export function pixelsPerSecond(zoom: number): number {
	return PX_PER_SEC * zoom;
}

export function useTimelineTracks(options: { initialTracks?: Track[] } = {}) {
	const { initialTracks = [] } = options;
	const [tracks, setTracks] = useState<Track[]>(initialTracks);
	const [snap, setSnap] = useState(true);
	const [zoom, setZoom] = useState(1);
	const [undoStack, setUndoStack] = useState<Track[][]>([]);
	const [redoStack, setRedoStack] = useState<Track[][]>([]);

	const dragStartRef = useRef<{ id: string; startTime: number } | null>(null);
	/** Latest drag transform delta (px) per clip id, written during render. */
	const transformRefs = useRef<Map<string, number>>(new Map());

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	const pushUndo = useCallback(() => {
		setUndoStack((prev) => [...prev, tracks.map((t) => ({ ...t }))]);
		setRedoStack([]);
	}, [tracks]);

	const undo = useCallback(() => {
		if (undoStack.length === 0) {
			return;
		}
		setRedoStack((prev) => [...prev, tracks.map((t) => ({ ...t }))]);
		setTracks(undoStack[undoStack.length - 1].map((t) => ({ ...t })));
		setUndoStack((prev) => prev.slice(0, -1));
	}, [tracks, undoStack]);

	const redo = useCallback(() => {
		if (redoStack.length === 0) {
			return;
		}
		setUndoStack((prev) => [...prev, tracks.map((t) => ({ ...t }))]);
		setTracks(redoStack[redoStack.length - 1].map((t) => ({ ...t })));
		setRedoStack((prev) => prev.slice(0, -1));
	}, [tracks, redoStack]);

	const moveTrackTo = useCallback(
		(id: string, startTime: number) => {
			pushUndo();
			setTracks((prev) =>
				prev.map((t) => (t.id === id ? { ...t, startTime } : t)),
			);
		},
		[pushUndo],
	);

	const maxDuration = useCallback(() => {
		return Math.max(1, ...tracks.map((t) => t.startTime + (t.duration ?? 0)));
	}, [tracks]);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			const id = event.active.id as string;
			const track = tracks.find((t) => t.id === id);
			dragStartRef.current = { id, startTime: track?.startTime ?? 0 };
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
			const deltaX = transformRefs.current.get(id) ?? 0;
			transformRefs.current.delete(id);
			const pps = pixelsPerSecond(zoom);
			const deltaSeconds = deltaX / pps;
			const clamped = Math.max(0, start.startTime + deltaSeconds);
			const placed = snap ? snapTime(clamped) : clamped;
			moveTrackTo(id, placed);
		},
		[zoom, snap, moveTrackTo],
	);

	return {
		tracks,
		setTracks,
		snap,
		setSnap,
		zoom,
		setZoom,
		undoStack,
		redoStack,
		pushUndo,
		undo,
		redo,
		moveTrackTo,
		maxDuration,
		snapTime,
		pixelsPerSecond,
		sensors,
		handleDragStart,
		handleDragEnd,
		transformRefs,
	};
}
