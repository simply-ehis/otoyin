import {
	CheckIcon as Check,
	ClipboardIcon as Copy,
	Squares2X2Icon as GalleryVerticalEnd,
	MinusIcon as Minus,
	PauseIcon as Pause,
	PlayIcon as Play,
	PlusIcon as Plus,
	ArrowUturnLeftIcon as RotateCcw,
	ScissorsIcon as Scissors,
	StopIcon as Square,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
	GenerationVersionResponse,
	StoryItemDetail,
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { ClipPanPopover } from "./ClipPanPopover";
import { ClipVolumePopover } from "./ClipVolumePopover";
import type { EditorToolbarProps, Mutator } from "./EditorToolbar.types";
import { ClipToolsMenu, EditTools } from "./EditorToolbarMenus";
import { formatTime } from "./timeline";

function IconButton({
	icon,
	label,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			variant="ghost"
			size="icon"
			className="size-7"
			onClick={onClick}
			title={label}
			aria-label={label}
		>
			{icon}
		</Button>
	);
}

function PlayControls({
	isCurrentlyPlaying,
	currentTimeMs,
	totalDurationMs,
	onPlayPause,
	onStop,
}: {
	isCurrentlyPlaying: boolean;
	currentTimeMs: number;
	totalDurationMs: number;
	onPlayPause: () => void;
	onStop: () => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<Button
				variant="ghost"
				size="icon"
				className="size-7"
				onClick={onPlayPause}
				title="Play/Pause (Space)"
				aria-label={isCurrentlyPlaying ? "Pause" : "Play"}
			>
				{isCurrentlyPlaying ? (
					<Pause className="size-4" />
				) : (
					<Play className="size-4" />
				)}
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="size-7"
				onClick={onStop}
				disabled={!isCurrentlyPlaying}
				aria-label="Stop"
			>
				<Square className="size-3" />
			</Button>
			<span className="text-xs text-muted-foreground tabular-nums ml-2">
				{formatTime(currentTimeMs)} / {formatTime(totalDurationMs)}
			</span>
		</div>
	);
}

function ZoomControls({
	onZoomOut,
	onZoomIn,
}: {
	onZoomOut: () => void;
	onZoomIn: () => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-xs text-muted-foreground">Zoom:</span>
			<Button
				variant="ghost"
				size="icon"
				className="size-6"
				onClick={onZoomOut}
				aria-label="Zoom out"
			>
				<Minus className="size-3" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="size-6"
				onClick={onZoomIn}
				aria-label="Zoom in"
			>
				<Plus className="size-3" />
			</Button>
		</div>
	);
}

function VersionMenu({
	activeVersionLabel,
	selectedItem,
	selectedItemVersions,
	onSetVersion,
}: {
	activeVersionLabel: string | null;
	selectedItem: StoryItemDetail;
	selectedItemVersions: GenerationVersionResponse[];
	onSetVersion: (versionId: string) => void;
}) {
	return (
		<>
			<div className="w-px h-4 bg-border mx-1" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="h-7 gap-2 px-2 text-xs"
						title="Change version/take"
					>
						<GalleryVerticalEnd className="h-3.5 w-3.5" />
						<span className="max-w-[80px] truncate">
							{activeVersionLabel ?? "default"}
						</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center" className="min-w-[160px]">
					{selectedItemVersions.map((version) => {
						const isActive = selectedItem.version_id
							? version.id === selectedItem.version_id
							: version.is_default;
						return (
							<DropdownMenuItem
								key={version.id}
								onClick={() => onSetVersion(version.id)}
								className="gap-2 text-xs"
							>
								<Check
									className={cn(
										"size-3",
										isActive ? "opacity-100" : "opacity-0",
									)}
								/>
								<span className="truncate">{version.label}</span>
								{version.effects_chain && version.effects_chain.length > 0 && (
									<span className="text-muted-foreground ml-auto text-xs">
										{version.effects_chain.length} fx
									</span>
								)}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}

function ClipEditControls({
	storyId,
	selectedItem,
	hasMultipleVersions,
	activeVersionLabel,
	selectedItemVersions,
	onSplit,
	onDuplicate,
	onDelete,
	onRegenerate,
	onSetVersion,
	updateVolume,
	setFade,
	setGain,
	setPan,
	normalizeItem,
	reverseItem,
	removeSilence,
	items,
}: {
	storyId: string;
	selectedItem: StoryItemDetail;
	hasMultipleVersions: boolean;
	activeVersionLabel: string | null;
	selectedItemVersions: GenerationVersionResponse[];
	onSplit: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onRegenerate: () => void;
	onSetVersion: (versionId: string) => void;
	updateVolume: Mutator<{
		storyId: string;
		itemId: string;
		data: { volume: number };
	}>;
	setFade: Mutator<{
		storyId: string;
		itemId: string;
		data: { fade_in_ms: number; fade_out_ms: number };
	}>;
	setGain: Mutator<{
		storyId: string;
		itemId: string;
		data: { gain_db: number };
	}>;
	setPan: Mutator<{ storyId: string; itemId: string; data: { pan: number } }>;
	normalizeItem: Mutator<{ storyId: string; itemId: string }>;
	reverseItem: Mutator<{ storyId: string; itemId: string }>;
	removeSilence: Mutator<{ storyId: string; itemId: string }>;
	items: StoryItemDetail[];
}) {
	const sorted = [...items].sort((a, b) => a.start_time_ms - b.start_time_ms);
	const idx = sorted.findIndex((i) => i.id === selectedItem.id);
	const nextItem =
		idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : undefined;

	return (
		<div className="flex items-center gap-1">
			<IconButton
				icon={<Scissors className="size-4" />}
				label="Split at playhead (S)"
				onClick={onSplit}
			/>
			<IconButton
				icon={<Copy className="size-4" />}
				label="Duplicate clip (Cmd/Ctrl+D)"
				onClick={onDuplicate}
			/>
			<ClipVolumePopover
				storyId={storyId}
				itemId={selectedItem.id}
				volume={selectedItem.volume}
				onChange={(value: number) =>
					updateVolume.mutate(
						{ storyId, itemId: selectedItem.id, data: { volume: value } },
						{ onError: () => {} },
					)
				}
			/>
			<ClipPanPopover
				storyId={storyId}
				itemId={selectedItem.id}
				pan={selectedItem.pan}
				onChange={(value: number) =>
					setPan.mutate(
						{ storyId, itemId: selectedItem.id, data: { pan: value } },
						{ onError: () => {} },
					)
				}
			/>
			<EditTools
				storyId={storyId}
				selectedItem={selectedItem}
				nextItem={nextItem}
			/>
			<ClipToolsMenu
				storyId={storyId}
				selectedItem={selectedItem}
				setFade={setFade}
				setGain={setGain}
				normalizeItem={normalizeItem}
				reverseItem={reverseItem}
				removeSilence={removeSilence}
			/>
			<IconButton
				icon={<Trash2 className="size-4" />}
				label="Delete clip (Delete/Backspace)"
				onClick={onDelete}
			/>
			{selectedItem.engine !== "import" && (
				<IconButton
					icon={<RotateCcw className="size-4" />}
					label="Regenerate clip"
					onClick={onRegenerate}
				/>
			)}
			{hasMultipleVersions && (
				<VersionMenu
					activeVersionLabel={activeVersionLabel}
					selectedItem={selectedItem}
					selectedItemVersions={selectedItemVersions}
					onSetVersion={onSetVersion}
				/>
			)}
		</div>
	);
}

export function EditorToolbar({
	storyId,
	isCurrentlyPlaying,
	currentTimeMs,
	totalDurationMs,
	selectedClipId,
	selectedItem,
	hasMultipleVersions,
	activeVersionLabel,
	selectedItemVersions,
	onPlayPause,
	onStop,
	onSplit,
	onDuplicate,
	onDelete,
	onRegenerate,
	onSetVersion,
	onZoomOut,
	onZoomIn,
	items,
	updateVolume,
	setFade,
	setGain,
	setPan,
	normalizeItem,
	reverseItem,
	removeSilence,
}: EditorToolbarProps) {
	return (
		<div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 mt-2">
			<PlayControls
				isCurrentlyPlaying={isCurrentlyPlaying}
				currentTimeMs={currentTimeMs}
				totalDurationMs={totalDurationMs}
				onPlayPause={onPlayPause}
				onStop={onStop}
			/>
			{selectedClipId && selectedItem && (
				<ClipEditControls
					storyId={storyId}
					selectedItem={selectedItem}
					hasMultipleVersions={hasMultipleVersions}
					activeVersionLabel={activeVersionLabel}
					selectedItemVersions={selectedItemVersions}
					onSplit={onSplit}
					onDuplicate={onDuplicate}
					onDelete={onDelete}
					onRegenerate={onRegenerate}
					onSetVersion={onSetVersion}
					updateVolume={updateVolume}
					setFade={setFade}
					setGain={setGain}
					setPan={setPan}
					normalizeItem={normalizeItem}
					reverseItem={reverseItem}
					removeSilence={removeSilence}
					items={items}
				/>
			)}
			<ZoomControls onZoomOut={onZoomOut} onZoomIn={onZoomIn} />
		</div>
	);
}

// Re-export from extracted modules for convenience
export type { EditorToolbarProps, Mutator } from "./EditorToolbar.types";
export { ClipToolsMenu, EditTools } from "./EditorToolbarMenus";
