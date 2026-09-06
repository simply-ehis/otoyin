import { Bars3Icon as GripHorizontal } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import type { StoryItemDetail } from "@/lib/api/types";
import {
	useCrossfadeStoryItems,
	useMergeStoryItems,
	useMoveStoryItem,
	useNormalizeStoryItem,
	useRemoveSilenceFromStoryItem,
	useReverseStoryItem,
	useSetStoryItemFade,
	useSetStoryItemGain,
	useSetStoryItemPan,
	useSetStoryItemSpeed,
	useTrimStoryItem,
	useUpdateStoryItemTimes,
	useUpdateStoryItemVolume,
} from "@/lib/hooks/useStories";
import { useStoryStore } from "@/stores/storyStore";
import { AutomationControls } from "./AutomationControls";
import { AutomationOverlay } from "./AutomationOverlay";
import { ClipItem } from "./ClipItem";
import { CrossfadeHandles } from "./CrossfadeHandles";
import { EditorScrollbar } from "./EditorScrollbar";
import { EditorToolbar } from "./EditorToolbar";
import { Playhead } from "./Playhead";
import { TimelineRuler } from "./TimelineRuler";
import { TrackRow } from "./TrackRow";
import {
	DEFAULT_TRACKS,
	LABEL_COL_WIDTH,
	SCRUB_BAR_HEIGHT,
	TRACK_HEIGHT,
} from "./timeline";
import { useEditorDrag } from "./useEditorDrag";
import { useEditorKeyboard } from "./useEditorKeyboard";
import { useEditorResize } from "./useEditorResize";
import { useEditorZoom } from "./useEditorZoom";
import { useStoryActions } from "./useStoryActions";
import { useStoryCrossfade } from "./useStoryCrossfade";
import { useStoryTrim } from "./useStoryTrim";
import { useTimelineState } from "./useTimelineState";

interface StoryTrackEditorProps {
	storyId: string;
	items: StoryItemDetail[];
}

export function StoryTrackEditor({ storyId, items }: StoryTrackEditorProps) {
	const [containerWidth, setContainerWidth] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const tracksRef = useRef<HTMLDivElement>(null);
	const moveItem = useMoveStoryItem();
	const trimItem = useTrimStoryItem();
	const updateVolume = useUpdateStoryItemVolume();
	const setFade = useSetStoryItemFade();
	const setGain = useSetStoryItemGain();
	const setPan = useSetStoryItemPan();
	const setSpeed = useSetStoryItemSpeed();
	const mergeItems = useMergeStoryItems();
	const crossfadeItems = useCrossfadeStoryItems();
	const normalizeItem = useNormalizeStoryItem();
	const reverseItem = useReverseStoryItem();
	const batchUpdateTimes = useUpdateStoryItemTimes();
	const removeSilence = useRemoveSilenceFromStoryItem();
	const { toast } = useToast();
	const [extraTracks, setExtraTracks] = useState<number[]>([]);

	const selectedClipId = useStoryStore((state) => state.selectedClipId);
	const setSelectedClipId = useStoryStore((state) => state.setSelectedClipId);

	const selectedItem = useMemo(
		() =>
			selectedClipId ? items.find((i) => i.id === selectedClipId) : undefined,
		[selectedClipId, items],
	);
	const selectedItemVersions = selectedItem?.versions;
	const hasMultipleVersions =
		selectedItemVersions && selectedItemVersions.length > 1;

	const activeVersionLabel = useMemo(() => {
		if (!selectedItem || !selectedItemVersions) {
			return null;
		}
		if (selectedItem.version_id) {
			const pinned = selectedItemVersions.find(
				(v) => v.id === selectedItem.version_id,
			);
			return pinned?.label ?? null;
		}
		const defaultVersion = selectedItemVersions.find((v) => v.is_default);
		return defaultVersion?.label ?? null;
	}, [selectedItem, selectedItemVersions]);

	const editorHeight = useStoryStore((state) => state.trackEditorHeight);
	const setEditorHeight = useStoryStore((state) => state.setTrackEditorHeight);

	const isPlaying = useStoryStore((state) => state.isPlaying);
	const currentTimeMs = useStoryStore((state) => state.currentTimeMs);
	const playbackStoryId = useStoryStore((state) => state.playbackStoryId);
	const play = useStoryStore((state) => state.play);
	const pause = useStoryStore((state) => state.pause);
	const stop = useStoryStore((state) => state.stop);
	const seek = useStoryStore((state) => state.seek);
	const setActiveStory = useStoryStore((state) => state.setActiveStory);

	const isActiveStory = playbackStoryId === storyId;
	const isCurrentlyPlaying = isPlaying && isActiveStory;

	const {
		handleSplit,
		handleDuplicate,
		handleDelete,
		handleRegenerate,
		handleSetVersion,
	} = useStoryActions({
		storyId,
		items,
		selectedClipId,
		currentTimeMs,
		setSelectedClipId,
	});

	const { handleResizeStart } = useEditorResize({
		editorHeight,
		setEditorHeight,
	});

	useEffect(() => {
		if (items.length > 0 && !isActiveStory) {
			const totalDuration = Math.max(
				...items.map((item) => {
					const effectiveDuration =
						(item.duration * 1000 -
							(item.trim_start_ms || 0) -
							(item.trim_end_ms || 0)) /
						(item.speed || 1);
					return item.start_time_ms + effectiveDuration;
				}),
				0,
			);
			setActiveStory(storyId, items, totalDuration);
		}
	}, [storyId, items, isActiveStory, setActiveStory]);

	const sortedItems = useMemo(() => {
		return [...items].sort((a, b) => a.start_time_ms - b.start_time_ms);
	}, [items]);

	const handlePlayPause = useCallback(() => {
		if (isCurrentlyPlaying) {
			pause();
		} else {
			play(storyId, sortedItems);
		}
	}, [isCurrentlyPlaying, pause, play, storyId, sortedItems]);

	const handleStop = () => {
		stop();
	};

	const tracks = useMemo(() => {
		const trackSet = new Set([
			...DEFAULT_TRACKS,
			...items.map((item) => item.track),
			...extraTracks,
		]);
		return Array.from(trackSet).sort((a, b) => b - a);
	}, [items, extraTracks]);

	const handleAddTrackAbove = useCallback(() => {
		setExtraTracks((prev) => {
			const all = new Set([
				...DEFAULT_TRACKS,
				...items.map((i) => i.track),
				...prev,
			]);
			const next = (all.size > 0 ? Math.max(...all) : 0) + 1;
			return [...prev, next];
		});
	}, [items]);

	const handleAddTrackBelow = useCallback(() => {
		setExtraTracks((prev) => {
			const all = new Set([
				...DEFAULT_TRACKS,
				...items.map((i) => i.track),
				...prev,
			]);
			const next = (all.size > 0 ? Math.min(...all) : 0) - 1;
			return [...prev, next];
		});
	}, [items]);

	useEffect(() => {
		const container = tracksRef.current;
		if (!container) {
			return;
		}
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setContainerWidth(entry.contentRect.width);
			}
		});
		observer.observe(container);
		setContainerWidth(container.clientWidth);
		return () => observer.disconnect();
	}, []);

	const {
		pixelsPerSecond,
		setPixelsPerSecond,
		totalDurationMs,
		minPps,
		maxPps,
		timelineWidth,
		timeMarkers,
		msToPixels,
		pixelsToMs,
	} = useTimelineState({ items, containerWidth });

	const {
		draggingItem,
		dragPosition,
		handleDragStart,
		handleDragMove,
		handleDragEnd,
	} = useEditorDrag({
		tracksRef,
		items,
		tracks,
		pixelsToMs,
		storyId,
		moveItem,
		batchUpdateTimes,
		toast,
	});

	const handleZoomIn = () => {
		setPixelsPerSecond((prev) => Math.min(prev * 1.5, maxPps));
	};

	const handleZoomOut = () => {
		setPixelsPerSecond((prev) => Math.max(prev / 1.5, minPps));
	};

	const handleTimelineClick = (e: React.MouseEvent<HTMLElement>) => {
		if (!tracksRef.current || draggingItem) {
			return;
		}
		const rect = tracksRef.current.getBoundingClientRect();
		const x =
			e.clientX - rect.left + tracksRef.current.scrollLeft - LABEL_COL_WIDTH;
		const timeMs = Math.max(0, pixelsToMs(x));
		seek(timeMs);
		setSelectedClipId(null);
	};

	const handleClipClick = (e: React.MouseEvent, item: StoryItemDetail) => {
		e.stopPropagation();
		if (draggingItem) {
			return;
		}
		setSelectedClipId(item.id);
	};

	useEditorKeyboard({
		selectedClipId,
		onPlayPause: handlePlayPause,
		onSplit: handleSplit,
		onDuplicate: handleDuplicate,
		onDelete: handleDelete,
		onDeselect: () => setSelectedClipId(null),
	});

	const { trimmingItem, tempTrimValues, handleTrimStart } = useStoryTrim({
		storyId,
		items,
		pixelsToMs,
		trimItem,
		batchUpdateTimes,
		setSelectedClipId,
		tracksRef,
	});

	const { crossfadeOverlaps, handleCrossfadeDragStart } = useStoryCrossfade({
		items,
		storyId,
		trimItem,
		pixelsToMs,
		tracksRef,
	});

	const {
		scrollbarTrackRef,
		thumbWidth,
		thumbLeft,
		canScrollHorizontally,
		handleScrollbarMouseDown,
	} = useEditorZoom({
		tracksRef,
		pixelsPerSecond,
		setPixelsPerSecond,
		containerWidth,
		totalDurationMs,
		minPps,
		maxPps,
		timelineWidth,
	});

	const playheadLeft = msToPixels(currentTimeMs);

	useEffect(() => {
		if (!isCurrentlyPlaying || !tracksRef.current) {
			return;
		}
		const container = tracksRef.current;
		const containerWidthEl = container.clientWidth;
		const scrollLeft = container.scrollLeft;
		const halfwayPoint = scrollLeft + containerWidthEl / 2;
		if (playheadLeft > halfwayPoint) {
			const targetScroll = playheadLeft - containerWidthEl / 2;
			container.scrollLeft = targetScroll;
		}
	}, [isCurrentlyPlaying, playheadLeft]);

	const tracksAreaHeight = tracks.length * TRACK_HEIGHT;
	const timelineContainerHeight = editorHeight - 40 - SCRUB_BAR_HEIGHT;

	if (items.length === 0) {
		return null;
	}

	return (
		<div className="sticky bottom-0 left-0 right-0 border-t bg-background z-50">
			<div
				className="border-t bg-card overflow-hidden relative"
				ref={containerRef}
			>
				<button
					type="button"
					className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize flex items-center justify-center hover:bg-muted/50 transition-colors z-20 group"
					onMouseDown={handleResizeStart}
					aria-label="Resize track editor"
				>
					<GripHorizontal className="size-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
				</button>

				<EditorToolbar
					storyId={storyId}
					isCurrentlyPlaying={isCurrentlyPlaying}
					currentTimeMs={currentTimeMs}
					totalDurationMs={totalDurationMs}
					selectedClipId={selectedClipId}
					selectedItem={selectedItem}
					hasMultipleVersions={!!hasMultipleVersions}
					activeVersionLabel={activeVersionLabel}
					selectedItemVersions={selectedItemVersions ?? []}
					onPlayPause={handlePlayPause}
					onStop={handleStop}
					onSplit={handleSplit}
					onDuplicate={handleDuplicate}
					onDelete={handleDelete}
					onRegenerate={handleRegenerate}
					onSetVersion={handleSetVersion}
					onZoomOut={handleZoomOut}
					onZoomIn={handleZoomIn}
					items={items}
					updateVolume={updateVolume}
					setFade={setFade}
					setGain={setGain}
					setPan={setPan}
					setSpeed={setSpeed}
					mergeItems={mergeItems}
					crossfadeItems={crossfadeItems}
					normalizeItem={normalizeItem}
					reverseItem={reverseItem}
					removeSilence={removeSilence}
				/>

				<AutomationControls />

				{/* biome-ignore lint/a11y/noStaticElementInteractions: Container handles drag events for child clips */}
				<div
					ref={tracksRef}
					className="overflow-auto relative"
					style={{ height: `${timelineContainerHeight}px` }}
					onMouseMove={draggingItem ? handleDragMove : undefined}
					onMouseUp={draggingItem ? handleDragEnd : undefined}
					onMouseLeave={draggingItem ? handleDragEnd : undefined}
				>
					<TimelineRuler
						timelineWidth={timelineWidth}
						timeMarkers={timeMarkers}
						msToPixels={msToPixels}
						onTimelineClick={handleTimelineClick}
					/>

					<div
						className="relative"
						style={{
							width: `${timelineWidth + LABEL_COL_WIDTH}px`,
							height: `${tracksAreaHeight}px`,
						}}
					>
						{tracks.map((trackNumber, index) => (
							<TrackRow
								key={trackNumber}
								index={index}
								isFirst={index === 0}
								isLast={index === tracks.length - 1}
								onAddTrackAbove={handleAddTrackAbove}
								onAddTrackBelow={handleAddTrackBelow}
							/>
						))}

						<div
							className="absolute top-0 bottom-0"
							style={{
								left: `${LABEL_COL_WIDTH}px`,
								width: `${timelineWidth}px`,
							}}
						>
							<button
								type="button"
								className="absolute inset-0 z-0 cursor-pointer"
								onClick={handleTimelineClick}
								aria-label="Seek timeline"
							/>

							{items.map((item) => (
								<ClipItem
									key={item.id}
									item={item}
									draggingItem={draggingItem}
									selectedClipId={selectedClipId}
									trimmingItem={trimmingItem}
									tempTrimValues={tempTrimValues}
									tracks={tracks}
									dragPosition={dragPosition}
									msToPixels={msToPixels}
									onClipClick={handleClipClick}
									onDragStart={handleDragStart}
									onTrimStart={handleTrimStart}
								/>
							))}

							<CrossfadeHandles
								overlaps={crossfadeOverlaps}
								tracks={tracks}
								msToPixels={msToPixels}
								onDragStart={handleCrossfadeDragStart}
							/>

							<AutomationOverlay
								show={useStoryStore.getState().showAutomation}
								selectedParam={useStoryStore.getState().selectedAutomationParam}
								tracks={tracks}
								pixelsPerSecond={pixelsPerSecond}
								timelineWidth={timelineWidth}
							/>

							<Playhead leftPx={playheadLeft} />
						</div>
					</div>
				</div>

				<EditorScrollbar
					scrollbarTrackRef={scrollbarTrackRef}
					thumbWidth={thumbWidth}
					thumbLeft={thumbLeft}
					canScrollHorizontally={canScrollHorizontally}
					pixelsPerSecond={pixelsPerSecond}
					minPps={minPps}
					maxPps={maxPps}
					onScrollbarMouseDown={handleScrollbarMouseDown}
				/>
			</div>
		</div>
	);
}
