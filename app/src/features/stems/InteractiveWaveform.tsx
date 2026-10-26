import { useRef, useState, useEffect } from "react";

interface Props {
	peaks: number[];
	color?: string;
	muted?: boolean;
	zoom?: number;
	onZoomChange?: (z: number) => void;
}

export function InteractiveWaveform({ peaks, color = "#a78bfa", muted = false, zoom = 1, onZoomChange }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [offset, setOffset] = useState(0);
	const [dragging, setDragging] = useState(false);
	const [lastX, setLastX] = useState(0);

	const totalBars = peaks.length;
	const visibleBars = Math.max(10, Math.floor(totalBars / zoom));
	const maxOffset = Math.max(0, totalBars - visibleBars);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		if (!peaks.length) return;
		const max = Math.max(...peaks, 0.01);
		const barW = canvas.width / visibleBars;
		ctx.fillStyle = muted ? "#666" : color;
		for (let i = 0; i < visibleBars; i++) {
			const idx = offset + i;
			if (idx >= peaks.length) break;
			const p = peaks[idx];
			const h = (p / max) * (canvas.height - 4);
			ctx.fillRect(i * barW, (canvas.height - h) / 2, Math.max(1, barW - 1), h);
		}
	}, [peaks, color, muted, zoom, offset, visibleBars]);

	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault();
		const newZoom = Math.max(1, Math.min(8, zoom + (e.deltaY < 0 ? 0.5 : -0.5)));
		if (onZoomChange) onZoomChange(newZoom);
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		setDragging(true);
		setLastX(e.clientX);
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!dragging) return;
		const dx = e.clientX - lastX;
		setLastX(e.clientX);
		const newOffset = Math.max(0, Math.min(maxOffset, offset - Math.round(dx / 4)));
		setOffset(newOffset);
	};

	const handleMouseUp = () => setDragging(false);

	return (
		<canvas
			ref={canvasRef}
			width={240}
			height={40}
			className="rounded cursor-grab"
			onWheel={handleWheel}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
		/>
	);
}