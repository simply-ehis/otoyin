import { useEffect } from "react";

interface UseEditorKeyboardOptions {
	selectedClipId: string | null;
	onPlayPause: () => void;
	onSplit: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onDeselect: () => void;
}

/**
 * Registers keyboard shortcuts for the story track editor.
 *
 * - `Space` → play/pause
 * - `Escape` → deselect clip
 * - `S` → split selected clip
 * - `Ctrl/Cmd+D` → duplicate selected clip
 * - `Delete/Backspace` → delete selected clip
 */
export function useEditorKeyboard({
	selectedClipId,
	onPlayPause,
	onSplit,
	onDuplicate,
	onDelete,
	onDeselect,
}: UseEditorKeyboardOptions) {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle shortcuts when editor is focused or no input is focused
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}

			if (e.key === " ") {
				e.preventDefault();
				onPlayPause();
			} else if (e.key === "Escape") {
				onDeselect();
			} else if (e.key === "s" || e.key === "S") {
				if (selectedClipId) {
					e.preventDefault();
					onSplit();
				}
			} else if (e.key === "d" || e.key === "D") {
				if (selectedClipId && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					onDuplicate();
				}
			} else if (e.key === "Delete" || e.key === "Backspace") {
				if (selectedClipId) {
					e.preventDefault();
					onDelete();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [selectedClipId, onSplit, onDuplicate, onDelete, onDeselect, onPlayPause]);
}
