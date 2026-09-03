import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { TranscriptEditor } from "./TranscriptEditor";
import { useTranscriptEditor } from "./useTranscriptEditor";

interface TranscriptDrawerProps {
	generationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function TranscriptDrawer({
	generationId,
	open,
	onOpenChange,
}: TranscriptDrawerProps) {
	const [deletePending, setDeletePending] = useState(false);

	const {
		words,
		loading,
		error,
		selectedIndices,
		handleClickWord,
		handleDeleteWords,
		toggleSelect,
		selectRange,
		clearSelection,
	} = useTranscriptEditor(open ? generationId : null);

	const handleDelete = async () => {
		if (selectedIndices.size === 0) {
			return;
		}
		setDeletePending(true);
		try {
			await handleDeleteWords(Array.from(selectedIndices).sort());
			clearSelection();
		} catch (err) {
			console.error("Delete failed:", err);
		} finally {
			setDeletePending(false);
		}
	};

	const handleSeek = (word: (typeof words)[0]) => {
		return handleClickWord(word);
	};

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="w-[480px] max-w-[90vw] flex flex-col">
				<DrawerHeader className="flex items-center justify-between p-4 border-b">
					<div>
						<DrawerTitle className="text-base font-semibold">
							Transcript Editor
						</DrawerTitle>
						<DrawerDescription className="text-xs text-muted-foreground">
							{words.length} words — {selectedIndices.size} selected
						</DrawerDescription>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => onOpenChange(false)}
						aria-label="Close"
					>
						<XMarkIcon className="size-5" />
					</Button>
				</DrawerHeader>{" "}
				<TranscriptEditor
					words={words}
					loading={loading}
					error={error}
					selectedIndices={selectedIndices}
					onSeekWord={handleSeek}
					onSelect={toggleSelect}
					onSelectRange={selectRange}
				/>
				{selectedIndices.size > 0 && (
					<div className="flex items-center gap-2 p-4 border-t">
						<Button variant="outline" size="sm" onClick={clearSelection}>
							Clear selection
						</Button>
						<Button
							variant="destructive"
							size="sm"
							onClick={handleDelete}
							disabled={deletePending}
						>
							<TrashIcon className="w-4 h-4 mr-2" />
							Delete ({selectedIndices.size})
						</Button>
					</div>
				)}
			</DrawerContent>
		</Drawer>
	);
}
