import { useEffect } from "react";

interface UseClickAwayArgs {
	isExpanded: boolean;
	setIsExpanded: (value: boolean) => void;
	containerRef: React.RefObject<HTMLElement | null>;
}

export function useClickAway({
	isExpanded,
	setIsExpanded,
	containerRef,
}: UseClickAwayArgs) {
	// Click away handler to collapse the box
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as HTMLElement;

			// Don't collapse if clicking inside the container
			if (containerRef.current?.contains(target)) {
				return;
			}

			// Don't collapse if clicking on a Select dropdown (which renders in a portal)
			if (
				target.closest('[role="listbox"]') ||
				target.closest("[data-radix-popper-content-wrapper]")
			) {
				return;
			}

			setIsExpanded(false);
		}

		if (isExpanded) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isExpanded, containerRef, setIsExpanded]);
}

interface UseAutoResizeTextareaArgs {
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	isExpanded: boolean;
}

export function useAutoResizeTextarea({
	textareaRef,
	isExpanded,
}: UseAutoResizeTextareaArgs) {
	// Auto-resize textarea based on content (only when expanded)
	useEffect(() => {
		if (!isExpanded) {
			// Reset textarea height after collapse animation completes
			const timeoutId = setTimeout(() => {
				const textarea = textareaRef.current;
				if (textarea) {
					textarea.style.height = "32px";
					textarea.style.overflowY = "hidden";
				}
			}, 200); // Wait for animation to complete
			return () => clearTimeout(timeoutId);
		}

		const textarea = textareaRef.current;
		if (!textarea) {
			return;
		}

		const adjustHeight = () => {
			textarea.style.height = "auto";
			const scrollHeight = textarea.scrollHeight;
			const minHeight = 100; // Expanded minimum
			const maxHeight = 300; // Max height in pixels
			const targetHeight = Math.max(
				minHeight,
				Math.min(scrollHeight, maxHeight),
			);
			textarea.style.height = `${targetHeight}px`;

			// Show scrollbar if content exceeds max height
			if (scrollHeight > maxHeight) {
				textarea.style.overflowY = "auto";
			} else {
				textarea.style.overflowY = "hidden";
			}
		};

		// Small delay to let framer animation complete
		const timeoutId = setTimeout(() => {
			adjustHeight();
		}, 200);

		// Adjust on mount and when value changes
		adjustHeight();

		// Watch for input changes
		textarea.addEventListener("input", adjustHeight);

		return () => {
			clearTimeout(timeoutId);
			textarea.removeEventListener("input", adjustHeight);
		};
	}, [isExpanded, textareaRef]);
}
