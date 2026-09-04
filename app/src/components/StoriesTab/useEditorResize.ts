import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_EDITOR_HEIGHT, MIN_EDITOR_HEIGHT } from "./timeline";

interface UseEditorResizeProps {
	editorHeight: number;
	setEditorHeight: (height: number) => void;
}

export function useEditorResize({
	editorHeight,
	setEditorHeight,
}: UseEditorResizeProps) {
	const [isResizing, setIsResizing] = useState(false);
	const resizeStartY = useRef(0);
	const resizeStartHeight = useRef(0);

	const handleResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsResizing(true);
			resizeStartY.current = e.clientY;
			resizeStartHeight.current = editorHeight;
		},
		[editorHeight],
	);

	const handleResizeMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizing) {
				return;
			}
			const deltaY = resizeStartY.current - e.clientY;
			const newHeight = Math.min(
				MAX_EDITOR_HEIGHT,
				Math.max(MIN_EDITOR_HEIGHT, resizeStartHeight.current + deltaY),
			);
			setEditorHeight(newHeight);
		},
		[isResizing, setEditorHeight],
	);

	const handleResizeEnd = useCallback(() => {
		setIsResizing(false);
	}, []);

	useEffect(() => {
		if (isResizing) {
			window.addEventListener("mousemove", handleResizeMove);
			window.addEventListener("mouseup", handleResizeEnd);
			return () => {
				window.removeEventListener("mousemove", handleResizeMove);
				window.removeEventListener("mouseup", handleResizeEnd);
			};
		}
	}, [isResizing, handleResizeMove, handleResizeEnd]);

	return { isResizing, handleResizeStart };
}
