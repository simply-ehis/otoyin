import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
export function MidiPianoRoll({
	notes,
	height = 60,
	className,
}: {
	notes: number[];
	height?: number;
	className?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || notes.length === 0) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}
		const dpr = window.devicePixelRatio || 1;
		const width = canvas.clientWidth;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, width, height);

		const whiteKeys = 52;
		const blackKeys = 36;
		const totalKeys = whiteKeys + blackKeys;
		const keyWidth = width / totalKeys;

		const whiteKeyNotes = [0, 2, 4, 5, 7, 9, 11];
		const isWhiteKey = (n: number) => whiteKeyNotes.includes(n % 12);

		for (let i = 0; i < totalKeys; i++) {
			const noteIndex = 21 + i;
			const isWhite = isWhiteKey(noteIndex);
			ctx.fillStyle = isWhite ? "#1a1a2e" : "#0d0d1a";
			ctx.fillRect(i * keyWidth, 0, keyWidth, height);
			ctx.strokeStyle = "#2a2a3e";
			ctx.strokeRect(i * keyWidth, 0, keyWidth, height);
		}

		const playedSet = new Set(notes);
		ctx.fillStyle = "hsl(142, 76%, 50%)";
		for (let i = 0; i < totalKeys; i++) {
			const noteIndex = 21 + i;
			if (playedSet.has(noteIndex)) {
				ctx.fillRect(i * keyWidth + 1, 2, keyWidth - 2, height - 4);
			}
		}
	}, [notes, height]);

	return (
		<canvas
			ref={canvasRef}
			className={cn("w-full rounded", className)}
			style={{ height }}
		/>
	);
}
