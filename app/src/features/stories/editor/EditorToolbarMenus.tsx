import {
	ArrowsRightLeftIcon,
	ClipboardDocumentIcon as ClipboardPaste,
	ClipboardIcon as Copy,
	ForwardIcon,
	MinusIcon as Minus,
	PlusIcon as Plus,
	ArrowUturnLeftIcon as RotateCcw,
	ScissorsIcon as Scissors,
	Cog6ToothIcon as Settings2,
	Square2StackIcon,
	SpeakerWaveIcon as Volume2,
	BoltIcon as Waves,
	BoltIcon as Zap,
} from "@heroicons/react/24/outline";
import { Button } from "@/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { useToast } from "@/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { StoryItemDetail } from "@/lib/api/types";
import {
	ERR_DESC_CLIPBOARD_EMPTY,
	ERR_TITLE_CLIPBOARD,
	ERR_TITLE_VALIDATION,
} from "@/lib/errorMessages";
import { useAddStoryItem } from "@/lib/hooks/useStories";
import { useClipboardStore } from "@/stores/clipboardStore";
import { usePlayerStore } from "@/stores/playerStore";
import type { Mutator } from "./EditorToolbar.types";

function ToolItem({
	icon,
	label,
	onClick,
}: {
	icon: React.JSX.Element;
	label: string;
	onClick: () => void;
}) {
	return (
		<DropdownMenuItem onClick={onClick}>
			{icon}
			{label}
		</DropdownMenuItem>
	);
}

// Per-clip editing primitives exposed to humans (the agent has the same tools
// programmatically). Copy/Cut store the clip in a process clipboard; Paste
// lands it in the timeline as a new story item. Expand/Whisper/Blend play the
// result back via the player.
export function EditTools({
	storyId,
	selectedItem,
	nextItem,
}: {
	storyId: string;
	selectedItem: StoryItemDetail;
	nextItem?: StoryItemDetail;
}) {
	const { toast } = useToast();
	const setAudioWithAutoPlay = usePlayerStore((s) => s.setAudioWithAutoPlay);
	const clipboard = useClipboardStore((s) => s.clip);
	const setClip = useClipboardStore((s) => s.setClip);
	const addStoryItem = useAddStoryItem();

	const playResult = (filename: string, title: string) => {
		const url = apiClient.getExportUrl(filename);
		setAudioWithAutoPlay(url, `${storyId}-edit`, null, title);
	};

	const guard = (fn: () => Promise<void>, label: string) =>
		fn().catch((error) =>
			toast({
				title: `${label} failed`,
				description: error instanceof Error ? error.message : String(error),
				variant: "destructive",
			}),
		);

	const pasteAsNewClip = () =>
		guard(async () => {
			if (!clipboard) {
				toast({
					title: ERR_TITLE_CLIPBOARD,
					description: ERR_DESC_CLIPBOARD_EMPTY,
					variant: "destructive",
				});
				return;
			}
			const gen = await apiClient.createGenerationFromAudio(
				clipboard.storagePath,
				clipboard.label,
			);
			await addStoryItem.mutateAsync({
				storyId,
				data: { generation_id: gen.id },
			});
			toast({ title: "Pasted as new clip", description: clipboard.label });
		}, "Paste");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					title="Audio editing tools"
					aria-label="Audio editing tools"
				>
					<Scissors className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<ToolItem
					icon={<Copy className="mr-2 size-4" />}
					label="Copy clip to clipboard"
					onClick={() =>
						guard(async () => {
							const r = await apiClient.copySegment(selectedItem.audio_path);
							setClip({
								storagePath: r.output_path,
								filename: r.filename,
								durationS: r.duration_s,
								label: "Copied clip",
							});
							toast({
								title: "Clip copied",
								description: `${r.duration_s}s ready to paste`,
							});
						}, "Copy")
					}
				/>
				<ToolItem
					icon={<Copy className="mr-2 size-4" />}
					label="Cut clip to clipboard"
					onClick={() =>
						guard(async () => {
							const r = await apiClient.cutSegment(selectedItem.audio_path);
							setClip({
								storagePath: r.clip_path,
								filename: r.clip_path.split("/").at(-1) ?? "",
								durationS: r.clip_duration_s,
								label: "Cut clip",
							});
							toast({
								title: "Clip cut to clipboard",
								description: `${r.clip_duration_s}s ready to paste`,
							});
						}, "Cut")
					}
				/>
				<ToolItem
					icon={<ClipboardPaste className="mr-2 size-4" />}
					label={
						clipboard
							? `Paste as new clip (${clipboard.label})`
							: "Paste as new clip"
					}
					onClick={pasteAsNewClip}
				/>
				<ToolItem
					icon={<Plus className="mr-2 size-4" />}
					label="Expand / time-stretch…"
					onClick={() =>
						guard(async () => {
							const raw = window.prompt(
								"Stretch rate (e.g. 1.3 = 30% slower, 0.8 = faster):",
								"1.3",
							);
							if (!raw) {
								return;
							}
							const rate = Number.parseFloat(raw);
							if (!Number.isFinite(rate) || rate <= 0) {
								toast({
									title: ERR_TITLE_VALIDATION,
									description: "That playback rate isn't valid",
									variant: "destructive",
								});
								return;
							}
							const r = await apiClient.timeStretch(
								selectedItem.audio_path,
								rate,
							);
							playResult(r.filename, `Expanded ×${rate}`);
						}, "Expand")
					}
				/>
				<ToolItem
					icon={<Volume2 className="mr-2 size-4" />}
					label="Shout → Whisper"
					onClick={() =>
						guard(async () => {
							const r = await apiClient.shoutToWhisper(
								selectedItem.audio_path,
								0.7,
							);
							playResult(r.filename, "Whisper take");
						}, "Whisper")
					}
				/>
				<ToolItem
					icon={<Waves className="mr-2 size-4" />}
					label={
						nextItem ? "Blend with next clip" : "Blend (needs a next clip)"
					}
					onClick={() =>
						guard(async () => {
							if (!nextItem) {
								toast({
									title: "No clip after this one to blend with",
									variant: "destructive",
								});
								return;
							}
							const r = await apiClient.blendAudio(
								selectedItem.audio_path,
								nextItem.audio_path,
								200,
								0,
							);
							playResult(r.filename, "Blended clip");
						}, "Blend")
					}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function ClipToolsMenu({
	storyId,
	selectedItem,
	nextItem,
	setFade,
	setGain,
	setSpeed,
	mergeItems,
	crossfadeItems,
	normalizeItem,
	reverseItem,
	removeSilence,
}: {
	storyId: string;
	selectedItem: StoryItemDetail;
	nextItem?: StoryItemDetail;
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
	setSpeed: Mutator<{
		storyId: string;
		itemId: string;
		data: { speed: number };
	}>;
	mergeItems: Mutator<{
		storyId: string;
		data: { first_item_id: string; second_item_id: string };
	}>;
	crossfadeItems: Mutator<{
		storyId: string;
		itemId: string;
		data: { next_item_id: string; duration_ms: number };
	}>;
	normalizeItem: Mutator<{ storyId: string; itemId: string }>;
	reverseItem: Mutator<{ storyId: string; itemId: string }>;
	removeSilence: Mutator<{ storyId: string; itemId: string }>;
}) {
	const { toast } = useToast();
	const itemId = selectedItem.id;

	const SPEEDS = [1, 1.25, 1.5, 2, 0.75, 0.5];
	const currentSpeed = selectedItem.speed ?? 1;
	const nextSpeed =
		SPEEDS[
			(SPEEDS.indexOf(currentSpeed) + 1 + SPEEDS.length) % SPEEDS.length
		] ?? 1;

	const run = <T,>(mutate: Mutator<T>, args: T) =>
		mutate.mutate(args, {
			onError: (error) => {
				toast({
					title: "Edit tool failed",
					description: error instanceof Error ? error.message : String(error),
					variant: "destructive",
				});
			},
		});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					title="Edit tools"
					aria-label="Edit tools"
				>
					<Settings2 className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<ToolItem
					icon={<Waves className="mr-2 size-4" />}
					label={
						selectedItem.fade_in_ms > 0 || selectedItem.fade_out_ms > 0
							? "Remove Fade"
							: "Add 500ms Fade"
					}
					onClick={() =>
						run(setFade, {
							storyId,
							itemId,
							data: {
								fade_in_ms: selectedItem.fade_in_ms > 0 ? 0 : 500,
								fade_out_ms: selectedItem.fade_out_ms > 0 ? 0 : 500,
							},
						})
					}
				/>
				<ToolItem
					icon={<Zap className="mr-2 size-4" />}
					label={selectedItem.gain_db !== 0 ? "Reset Gain" : "Boost +3dB"}
					onClick={() =>
						run(setGain, {
							storyId,
							itemId,
							data: { gain_db: selectedItem.gain_db !== 0 ? 0 : 3.0 },
						})
					}
				/>
				<ToolItem
					icon={<Volume2 className="mr-2 size-4" />}
					label="Normalize to -14 LUFS"
					onClick={() => run(normalizeItem, { storyId, itemId })}
				/>
				<ToolItem
					icon={<RotateCcw className="mr-2 size-4" />}
					label="Reverse Audio"
					onClick={() => run(reverseItem, { storyId, itemId })}
				/>
				<ToolItem
					icon={<Minus className="mr-2 size-4" />}
					label="Remove Silence"
					onClick={() => run(removeSilence, { storyId, itemId })}
				/>
				<ToolItem
					icon={<ForwardIcon className="mr-2 size-4" />}
					label={`Speed: ${currentSpeed}× → ${nextSpeed}×`}
					onClick={() =>
						run(setSpeed, { storyId, itemId, data: { speed: nextSpeed } })
					}
				/>
				{nextItem ? (
					<>
						<ToolItem
							icon={<Square2StackIcon className="mr-2 size-4" />}
							label="Merge with next clip"
							onClick={() =>
								run(mergeItems, {
									storyId,
									data: { first_item_id: itemId, second_item_id: nextItem.id },
								})
							}
						/>
						<ToolItem
							icon={<ArrowsRightLeftIcon className="mr-2 size-4" />}
							label="Crossfade into next (0.5s)"
							onClick={() =>
								run(crossfadeItems, {
									storyId,
									itemId,
									data: { next_item_id: nextItem.id, duration_ms: 500 },
								})
							}
						/>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
