import {
	ExclamationTriangleIcon as Alert,
	SpeakerWaveIcon as Headphones,
	PlayCircleIcon as Loader,
	ArrowsPointingOutIcon as Maximize,
	PlayIcon as Play,
	ArrowRightIcon as RedoIcon,
	ArrowLeftIcon as UndoIcon,
	ArrowSmallUpIcon as ZoomIn,
	ArrowSmallDownIcon as ZoomOut,
} from "@heroicons/react/24/outline";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DubSegment } from "@/lib/api/clientDubbing";
import { dubbingClient } from "@/lib/api/clientDubbing";
import { cn } from "@/lib/utils/cn";
import {
	clampSegmentEdit,
	commitMoveResize,
	detectOverlaps,
	dubSegmentPatch,
	formatTime,
	nearestOnset,
	snapCandidates,
	snapTime,
} from "@/lib/utils/timeline";
import { Button } from "@/ui/button";

type Gesture = {
	index: number;
	id: number;
	mode: "start" | "end" | "move";
	pointerId: number;
	x: number;
	start: number;
	end: number;
};

interface DubTimelineProps {
	segments: DubSegment[];
	mediaDuration: number | undefined;
	disabled?: boolean;
	onsets?: number[];
	peaks?: number[];
	previewingId?: number | null;
	selectedId: number | null;
	onSelect: (id: number | null) => void;
	onPreviewSegment?: (segment: DubSegment) => void;
	onSegmentsChange?: (segments: DubSegment[]) => void;
}

/**
 * DubTimeline — drag-resize waveform timeline for dub segment editing.
 *
 * Ported from VoiceStudio's dub-timeline.tsx, adapted to otoyin's stack
 * (heroicons, dubbingClient API, glass-panel surface).
 *
 * Features:
 * - Canvas-based onsets + peaks rendering
 * - Pointer drag: move / resize-start / resize-end with onset snapping
 * - Keyboard: Arrow focus, Delete, Enter edit mode, S snap-to-onset
 * - Overlap detection with visual warning
 * - Playhead sync
 * - Zoom controls (1x–16x)
 */
export function DubTimeline({
	segments,
	mediaDuration,
	disabled = false,
	onsets = [],
	peaks = [],
	previewingId,
	selectedId,
	onSelect,
	onPreviewSegment,
	onSegmentsChange,
}: DubTimelineProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	const host = useRef<HTMLDivElement>(null);
	const viewport = useRef<HTMLDivElement>(null);
	const onsetCanvas = useRef<HTMLCanvasElement>(null);
	const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const gesture = useRef<Gesture | null>(null);
	const liveRef = useRef<{ id: number; start: number; end: number } | null>(
		null,
	);
	const [live, setLive] = useState<{
		id: number;
		start: number;
		end: number;
	} | null>(null);
	const [focusId, setFocusId] = useState<number | null>(
		selectedId ?? segments[0]?.id ?? null,
	);
	const [editMode, setEditMode] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [timelineWidth, setTimelineWidth] = useState(1000);

	const duration = mediaDuration ?? 0;

	const deletedIdRef = useRef<number | null>(null);

	// Undo/redo
	const [undoStack, setUndoStack] = useState<DubSegment[][]>([]);
	const [redoStack, setRedoStack] = useState<DubSegment[][]>([]);

	const pushUndo = useCallback(() => {
		setUndoStack((prev) => [...prev, segments.map((s) => ({ ...s }))]);
		setRedoStack([]);
	}, [segments]);

	const undo = useCallback(() => {
		if (undoStack.length === 0) {
			return;
		}
		setRedoStack((prev) => [...prev, segments.map((s) => ({ ...s }))]);
		const prev = undoStack[undoStack.length - 1];
		setUndoStack((prev) => prev.slice(0, -1));
		onSegmentsChange?.(prev);
	}, [undoStack, segments, onSegmentsChange]);

	const redo = useCallback(() => {
		if (redoStack.length === 0) {
			return;
		}
		setUndoStack((prev) => [...prev, segments.map((s) => ({ ...s }))]);
		const next = redoStack[redoStack.length - 1];
		setRedoStack((prev) => prev.slice(0, -1));
		onSegmentsChange?.(next);
	}, [redoStack, segments, onSegmentsChange]);

	const moveResizeMutation = useMutation({
		mutationFn: ({
			id,
			patch,
		}: {
			id: number;
			patch: {
				start: number;
				end: number;
				speed?: number;
				original_duration?: number;
			};
		}) => dubbingClient.moveResizeDubSegment(id, patch),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["dub-job"] });
			onSegmentsChange?.(
				(segments ?? []).map((s) => (s.id === data.id ? data : s)),
			);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => dubbingClient.deleteDubSegment(id),
		onMutate: (id) => {
			deletedIdRef.current = id;
			pushUndo();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["dub-job"] });
			if (deletedIdRef.current !== null) {
				onSegmentsChange?.(
					(segments ?? []).filter((s) => s.id !== deletedIdRef.current),
				);
				deletedIdRef.current = null;
			}
		},
	});

	const effective = useMemo(
		() =>
			live
				? segments.map((segment) =>
						segment.id === live.id
							? { ...segment, start: live.start, end: live.end }
							: segment,
					)
				: segments,
		[live, segments],
	);

	const overlaps = useMemo(() => detectOverlaps(effective), [effective]);

	useEffect(() => {
		if (focusId && segments.some((s) => s.id === focusId)) {
			return;
		}
		setFocusId(selectedId ?? segments[0]?.id ?? null);
	}, [focusId, segments, selectedId]);

	const drawOnsets = useCallback(() => {
		const canvas = onsetCanvas.current;
		const container = host.current;
		if (!canvas || !container) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}
		const width = container.clientWidth;
		const height = container.clientHeight;
		setTimelineWidth(width);
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.min(8192, Math.max(1, Math.round(width * dpr)));
		canvas.height = Math.max(1, Math.round(height * dpr));
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		if (peaks.length) {
			const middle = height / 2;
			const step = width / peaks.length;
			ctx.fillStyle = getComputedStyle(canvas).color;
			ctx.globalAlpha = 0.28;
			for (let i = 0; i < peaks.length; i += 1) {
				const amplitude = Math.min(1, Math.max(0.02, peaks[i])) * height * 0.42;
				ctx.fillRect(
					i * step,
					middle - amplitude,
					Math.max(1, step * 0.65),
					amplitude * 2,
				);
			}
			ctx.globalAlpha = 1;
		}

		ctx.strokeStyle = getComputedStyle(canvas).color;
		ctx.lineWidth = dpr;
		ctx.beginPath();
		for (const onset of onsets) {
			if (onset < 0 || onset > duration) {
				continue;
			}
			const x = Math.round((onset / duration) * width) + 0.5;
			ctx.moveTo(x, height * 0.62);
			ctx.lineTo(x, height);
		}
		ctx.stroke();
	}, [duration, onsets, peaks]);

	useEffect(() => {
		const canvas = onsetCanvas.current;
		const container = host.current;
		if (!canvas || !container) {
			return;
		}
		drawOnsets();
		const observer = new ResizeObserver(drawOnsets);
		observer.observe(container);
		const themeObserver = new MutationObserver(drawOnsets);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "data-theme", "style"],
		});
		return () => {
			observer.disconnect();
			themeObserver.disconnect();
		};
	}, [drawOnsets]);

	const begin = (event: React.PointerEvent<HTMLDivElement>, index: number) => {
		if (disabled || event.button !== 0) {
			return;
		}
		if (
			((effective[index].end - effective[index].start) / duration) *
				timelineWidth <
			16
		) {
			return;
		}
		pushUndo();
		const segment = effective[index];
		const mode =
			(event.target as HTMLElement).dataset.edge === "start"
				? "start"
				: (event.target as HTMLElement).dataset.edge === "end"
					? "end"
					: "move";
		gesture.current = {
			index,
			id: segment.id,
			mode,
			pointerId: event.pointerId,
			x: event.clientX,
			start: segment.start,
			end: segment.end,
		};
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			/* Pointer capture is absent in some embedded/test DOMs. */
		}
		onSelect(segment.id);
	};

	const move = (event: React.PointerEvent<HTMLDivElement>) => {
		const active = gesture.current;
		const width = host.current?.clientWidth || 0;
		if (!active || !width) {
			return;
		}
		const delta = ((event.clientX - active.x) / width) * duration;
		const proposed =
			active.mode === "move"
				? { start: active.start + delta, end: active.end + delta }
				: active.mode === "start"
					? { start: active.start + delta, end: active.end }
					: { start: active.start, end: active.end + delta };
		let snapped = proposed;
		if (!event.altKey) {
			const edge = active.mode === "end" ? proposed.end : proposed.start;
			const candidates = snapCandidates({
				onsets,
				prevEnd: effective[active.index - 1]?.end,
				nextStart: effective[active.index + 1]?.start,
				pxPerSec: width / duration,
				t: edge,
			});
			const result = snapTime(edge, candidates, (8 / width) * duration);
			if (result.candidate != null) {
				if (active.mode === "move") {
					const length = active.end - active.start;
					snapped = { start: result.time, end: result.time + length };
				} else if (active.mode === "start") {
					snapped = { ...proposed, start: result.time };
				} else {
					snapped = { ...proposed, end: result.time };
				}
			}
		}
		const next = clampSegmentEdit(
			effective,
			active.index,
			active.mode,
			snapped,
			{ allowOverlap: event.altKey, duration },
		);
		liveRef.current = { id: active.id, ...next };
		setLive(liveRef.current);
	};

	const finish = (event: React.PointerEvent<HTMLDivElement>, commit = true) => {
		const active = gesture.current;
		gesture.current = null;
		const current = liveRef.current;
		if (commit && active && current?.id === active.id) {
			const seg = effective.find((s) => s.id === active.id);
			if (seg) {
				const updated = commitMoveResize(seg, {
					start: current.start,
					end: current.end,
				});
				if (
					updated.start !== seg.start ||
					updated.end !== seg.end ||
					updated.speed !== seg.speed
				) {
					moveResizeMutation.mutate({
						id: updated.id as number,
						patch: dubSegmentPatch(updated),
					});
				}
			}
		}
		liveRef.current = null;
		setLive(null);
		try {
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
		} catch {
			/* Pointer capture is absent in some embedded/test DOMs. */
		}
	};

	const selectAndFocus = (id: number) => {
		setFocusId(id);
		onSelect(id);
		requestAnimationFrame(() =>
			segmentRefs.current.get(id)?.focus({ preventScroll: true }),
		);
	};

	const moveFocus = (index: number, direction: -1 | 1) => {
		const next = segments[index + direction];
		if (next) {
			selectAndFocus(next.id);
		}
	};

	const nudge = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
		const segment = segments[index];
		if (disabled) {
			return;
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			event.stopPropagation();
			const neighbor = segments[index + 1] || segments[index - 1];
			deleteMutation.mutate(segment.id);
			if (neighbor) {
				selectAndFocus(neighbor.id);
			}
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			setEditMode((active) => !active);
			return;
		}
		if (event.key === "Escape" && editMode) {
			event.preventDefault();
			event.stopPropagation();
			setEditMode(false);
			return;
		}
		if (event.key.toLowerCase() === "z" && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			event.stopPropagation();
			undo();
			return;
		}
		if (event.key.toLowerCase() === "y" && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			event.stopPropagation();
			redo();
			return;
		}
		if (event.key.toLowerCase() === "s") {
			event.preventDefault();
			event.stopPropagation();
			const adjustEnd = event.shiftKey;
			const onset = nearestOnset(
				adjustEnd ? segment.end : segment.start,
				onsets,
			);
			if (onset == null) {
				return;
			}
			const next = clampSegmentEdit(
				effective,
				index,
				adjustEnd ? "end" : "start",
				adjustEnd
					? { start: segment.start, end: onset }
					: { start: onset, end: segment.end },
				{ duration },
			);
			const seg = effective.find((s) => s.id === segment.id);
			if (seg) {
				const updated = commitMoveResize(seg, next);
				moveResizeMutation.mutate({
					id: updated.id as number,
					patch: dubSegmentPatch(updated),
				});
			}
			return;
		}
		if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const direction = event.key === "ArrowLeft" ? -1 : 1;
		if (!editMode) {
			moveFocus(index, direction);
			return;
		}
		const amount = (event.ctrlKey || event.metaKey ? 0.1 : 0.01) * direction;
		const mode = event.altKey ? "move" : event.shiftKey ? "end" : "start";
		const next = clampSegmentEdit(
			effective,
			index,
			mode,
			mode === "move"
				? { start: segment.start + amount, end: segment.end + amount }
				: mode === "end"
					? { start: segment.start, end: segment.end + amount }
					: { start: segment.start + amount, end: segment.end },
			{ duration },
		);
		const seg = effective.find((s) => s.id === segment.id);
		if (seg) {
			const updated = commitMoveResize(seg, next);
			moveResizeMutation.mutate({
				id: updated.id as number,
				patch: dubSegmentPatch(updated),
			});
		}
	};

	return (
		<section
			aria-label={t("dubbing.timeline_label") ?? "Dub timeline"}
			className={cn(
				"rounded-xl border border-border/60 glass-panel p-3 shadow-sm",
			)}
		>
			<div className="mb-2 flex justify-end gap-1">
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Undo"
					disabled={undoStack.length === 0}
					onClick={undo}
				>
					<UndoIcon className="size-4" aria-hidden="true" />
				</Button>
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Redo"
					disabled={redoStack.length === 0}
					onClick={redo}
				>
					<RedoIcon className="size-4" aria-hidden="true" />
				</Button>
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Zoom out"
					disabled={zoom <= 1}
					onClick={() => setZoom((z) => Math.max(1, z / 2))}
				>
					<ZoomOut className="size-4" aria-hidden="true" />
				</Button>
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Zoom in"
					disabled={zoom >= 16}
					onClick={() => setZoom((z) => Math.min(16, z * 2))}
				>
					<ZoomIn className="size-4" aria-hidden="true" />
				</Button>
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Fit all"
					onClick={() => setZoom(1)}
				>
					<Maximize className="size-4" aria-hidden="true" />
				</Button>
			</div>
			<div
				ref={viewport}
				className="overflow-x-auto rounded-lg [scrollbar-width:thin]"
			>
				<div
					ref={host}
					style={{ width: `${zoom * 100}%` }}
					role="listbox"
					aria-orientation="horizontal"
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
						}
					}}
					onClick={(event) => {
						if (
							(event.target as HTMLElement).closest("[data-timeline-segment]")
						) {
							return;
						}
						const bounds = event.currentTarget.getBoundingClientRect();
						if (bounds.width > 0 && duration > 0) {
							const pos =
								((event.clientX - bounds.left) / bounds.width) * duration;
							event.currentTarget.dispatchEvent(
								new CustomEvent("timeline-seek", {
									detail: { position: pos },
								}),
							);
						}
					}}
					className={cn(
						"relative h-16 touch-none overflow-hidden rounded-lg border border-border/50 bg-muted/20",
						"[background-image:repeating-linear-gradient(90deg,transparent_0,transparent_calc(10%_-_1px),color-mix(in_oklch,var(--border),transparent_55%)_10%)]",
					)}
				>
					<canvas
						ref={onsetCanvas}
						className="pointer-events-none absolute inset-0 text-muted-foreground/45"
					/>
					{duration > 0 && (
						<span
							aria-hidden="true"
							className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-accent shadow-[0_0_8px_color-mix(in_oklch,var(--accent),transparent_20%)]"
							style={{ left: "0%" }}
						/>
					)}
					{effective.map((segment, index) => {
						const isWide =
							((segment.end - segment.start) / duration) * timelineWidth >= 24;
						return (
							<div
								key={segment.id}
								ref={(element) => {
									if (element) {
										segmentRefs.current.set(segment.id, element);
									} else {
										segmentRefs.current.delete(segment.id);
									}
								}}
								role="option"
								tabIndex={
									focusId === segment.id || (!focusId && index === 0) ? 0 : -1
								}
								data-timeline-segment={String(segment.id)}
								aria-label={`${t("dubbing.segment_label") ?? "Segment"} ${index + 1}, ${formatTime(
									segment.start,
								)} - ${formatTime(segment.end)}`}
								aria-selected={selectedId === segment.id}
								onClick={() => selectAndFocus(segment.id)}
								onDoubleClick={() => {}}
								onKeyDown={(event) => nudge(event, index)}
								onFocus={() => setFocusId(segment.id)}
								onBlur={(event) => {
									if (
										!event.currentTarget.parentElement?.contains(
											event.relatedTarget,
										)
									) {
										setEditMode(false);
									}
								}}
								onPointerDown={(event) => begin(event, index)}
								onPointerMove={move}
								onPointerUp={finish}
								onPointerCancel={(event) => finish(event, false)}
								className={cn(
									"absolute top-2 flex h-10 min-w-0 cursor-grab items-center overflow-hidden rounded-sm bg-accent/20 px-0 text-[10px] font-medium text-foreground outline-none transition-[box-shadow,background-color] active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring",
									selectedId === segment.id &&
										"border-accent/70 bg-accent/35 shadow-sm",
									focusId === segment.id &&
										editMode &&
										"ring-2 ring-accent ring-offset-1 ring-offset-background",
									overlaps.has(String(segment.id)) &&
										"border-destructive bg-destructive/20",
								)}
								style={{
									left: `${(segment.start / duration) * 100}%`,
									width: `${((segment.end - segment.start) / duration) * 100}%`,
								}}
							>
								{isWide && (
									<span
										data-edge="start"
										aria-hidden="true"
										className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-foreground/15"
									/>
								)}
								{isWide && (
									<span className="pointer-events-none truncate px-1">
										{index + 1}
									</span>
								)}
								{selectedId === segment.id &&
									((segment.end - segment.start) / duration) * timelineWidth >
										60 && (
										<div className="ml-auto flex shrink-0 gap-0.5">
											<button
												type="button"
												aria-label="Play segment"
												title="Play segment"
												className="flex size-5 items-center justify-center rounded-sm bg-background/75 text-foreground shadow-sm hover:bg-background"
												onPointerDown={(event) => event.stopPropagation()}
												onClick={(event) => {
													event.stopPropagation();
												}}
											>
												<Play className="size-3 fill-current" />
											</button>
											{onPreviewSegment &&
												((segment.end - segment.start) / duration) *
													timelineWidth >
													100 && (
													<button
														type="button"
														aria-label="Live preview"
														title="Live preview"
														disabled={Boolean(previewingId)}
														className={cn(
															"flex size-5 items-center justify-center rounded-sm bg-background/75 text-foreground shadow-sm hover:bg-background",
															Boolean(previewingId) &&
																"opacity-50 cursor-not-allowed",
														)}
														onPointerDown={(event) => event.stopPropagation()}
														onClick={(event) => {
															event.stopPropagation();
															onPreviewSegment(segment);
														}}
													>
														{previewingId === segment.id ? (
															<Loader className="size-3 animate-spin" />
														) : (
															<Headphones className="size-3" />
														)}
													</button>
												)}
										</div>
									)}
								{isWide && (
									<span
										data-edge="end"
										aria-hidden="true"
										className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-foreground/15"
									/>
								)}
							</div>
						);
					})}
				</div>
			</div>
			<div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
				<span>0:00.0</span>
				{overlaps.size > 0 && (
					<button
						type="button"
						className="flex items-center gap-1 text-destructive text-left"
						onClick={() => {
							const id = [...overlaps][0];
							setZoom(16);
							selectAndFocus(Number(id));
							requestAnimationFrame(() =>
								segmentRefs.current.get(Number(id))?.scrollIntoView({
									block: "nearest",
									inline: "center",
								}),
							);
						}}
					>
						<Alert className="size-3" />
						{t("dubbing.overlap_warning") ?? "Overlapping segments"}
					</button>
				)}
				<span>{formatTime(duration)}</span>
			</div>
		</section>
	);
}
