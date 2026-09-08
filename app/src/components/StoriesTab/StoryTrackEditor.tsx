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
import { CrossfadeHandles } from "./CrossfadeHandles";
import { EditorScrollbar } from "./EditorScrollbar";
import { EditorToolbar } from "./EditorToolbar";
import { DEFAULT_TRACKS, SCRUB_BAR_HEIGHT } from "./timeline";
import { useEditorKeyboard } from "./useEditorKeyboard";
import { useEditorResize } from "./useEditorResize";
import { useEditorZoom } from "./useEditorZoom";
import { useStoryActions } from "./useStoryActions";
import { useStoryCrossfade } from "./useStoryCrossfade";
import { useStoryTrim } from "./useStoryTrim";
import { useTimelineState } from "./useTimelineState";
import type { PlaylistZoomHandle } from "./WaveformPlaylistEditor";
import { WaveformPlaylistEditor } from "./WaveformPlaylistEditor";

interface StoryTrackEditorProps {
	storyId: string;
	items: StoryItemDetail[];
}

export function StoryTrackEditor({ storyId, items }: StoryTrackEditorProps) {
	const [containerWidth, setContainerWidth] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	// Points at the playlist's own scroll container (assigned by ref callback
	// on the WaveformPlaylistEditor's stage) so zoom/scroll helpers keep working.
	const tracksRef = useRef<HTMLDivElement | null>(null);
	const zoomHandleRef = useRef<PlaylistZoomHandle | null>(null);
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
	const trackConfigs = useStoryStore((state) => state.trackConfigs);
	const showAutomation = useStoryStore((state) => state.showAutomation);
	const selectedAutomationParam = useStoryStore(
		(state) => state.selectedAutomationParam,
	);

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
		const container = containerRef.current;
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
		msToPixels,
		pixelsToMs,
	} = useTimelineState({ items, containerWidth });

	const handleZoomIn = useCallback(() => {
		zoomHandleRef.current?.zoomIn();
	}, []);
	const handleZoomOut = useCallback(() => {
		zoomHandleRef.current?.zoomOut();
	}, []);

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

	const handleMoveItem = useCallback(
		(itemId: string, startTimeMs: number, track: number) => {
			moveItem.mutate(
				{ storyId, itemId, data: { start_time_ms: startTimeMs, track } },
				{
					onError: () => {
						toast({
							title: "Move failed",
							description: "The clip could not be moved. Please try again.",
							variant: "destructive",
						});
					},
				},
			);
		},
		[moveItem, storyId, toast],
	);

	const handleSelectClip = useCallback(
		(id: string | null) => {
			setSelectedClipId(id);
		},
		[setSelectedClipId],
	);

	const handleSeekMs = useCallback(
		(timeMs: number) => {
			seek(timeMs);
		},
		[seek],
	);

	const handleScrollerRef = useCallback((el: HTMLDivElement | null) => {
		tracksRef.current = el;
	}, []);

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

				<div
					className="overflow-hidden relative"
					style={{ height: `${timelineContainerHeight}px` }}
				>
					<WaveformPlaylistEditor
						storyId={storyId}
						items={items}
						pixelsPerSecond={pixelsPerSecond}
						onPixelsPerSecondChange={setPixelsPerSecond}
						currentTimeMs={currentTimeMs}
						tracks={tracks}
						selectedClipId={selectedClipId}
						onSelectClip={handleSelectClip}
						onSeekMs={handleSeekMs}
						onMoveItem={handleMoveItem}
						trackMutes={tracks.map((_, i) => trackConfigs[i]?.muted ?? false)}
						trackSolos={tracks.map((_, i) => trackConfigs[i]?.solo ?? false)}
						onAddTrackAbove={handleAddTrackAbove}
						onAddTrackBelow={handleAddTrackBelow}
						trimmingItem={trimmingItem}
						tempTrimValues={tempTrimValues}
						onTrimStart={handleTrimStart}
						onScrollerRef={handleScrollerRef}
						crossfadeHandles={
							<CrossfadeHandles
								overlaps={crossfadeOverlaps}
								tracks={tracks}
								msToPixels={msToPixels}
								onDragStart={handleCrossfadeDragStart}
							/>
						}
						automationOverlay={
							<AutomationOverlay
								show={showAutomation}
								selectedParam={selectedAutomationParam}
								tracks={tracks}
								pixelsPerSecond={pixelsPerSecond}
								timelineWidth={timelineWidth}
							/>
						}
						zoomHandleRef={zoomHandleRef}
					/>
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
