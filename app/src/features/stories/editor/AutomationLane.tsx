import { useCallback, useRef, useState } from "react";
import type { AutomationPoint } from "@/stores/storyStore";
import { useStoryStore } from "@/stores/storyStore";
import { TRACK_HEIGHT } from "./timeline";

interface AutomationLaneProps {
	track: number;
	parameter: string;
	min: number;
	max: number;
	defaultValue: number;
	pixelsPerSecond: number;
	totalWidth: number;
}

function interpolateValue(
	points: AutomationPoint[],
	timeMs: number,
	defaultValue: number,
): number {
	if (points.length === 0) {
		return defaultValue;
	}
	if (timeMs <= points[0].timeMs) {
		return points[0].value;
	}
	if (timeMs >= points[points.length - 1].timeMs) {
		return points[points.length - 1].value;
	}

	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i];
		const b = points[i + 1];
		if (timeMs >= a.timeMs && timeMs <= b.timeMs) {
			const t = (timeMs - a.timeMs) / (b.timeMs - a.timeMs);
			return a.value + t * (b.value - a.value);
		}
	}
	return defaultValue;
}

export function AutomationLane({
	track,
	parameter,
	min,
	max,
	defaultValue,
	pixelsPerSecond,
	totalWidth,
}: AutomationLaneProps) {
	const lane = useStoryStore((s) =>
		s.automationLanes[track]?.find((l) => l.parameter === parameter),
	);
	const points = lane?.points ?? [];
	const addPoint = useStoryStore((s) => s.addAutomationPoint);
	const movePoint = useStoryStore((s) => s.moveAutomationPoint);
	const removePoint = useStoryStore((s) => s.removeAutomationPoint);
	const currentTimeMs = useStoryStore((s) => s.currentTimeMs);

	const svgRef = useRef<SVGSVGElement>(null);
	const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

	const height = TRACK_HEIGHT - 8;
	const msToX = useCallback(
		(ms: number) => (ms / 1000) * pixelsPerSecond,
		[pixelsPerSecond],
	);
	const valueToY = useCallback(
		(val: number) => {
			const ratio = (val - min) / (max - min);
			return height - ratio * height;
		},
		[min, max, height],
	);
	const yToValue = useCallback(
		(y: number) => {
			const ratio = 1 - y / height;
			return min + ratio * (max - min);
		},
		[min, max, height],
	);
	const xToMs = useCallback(
		(x: number) => (x / pixelsPerSecond) * 1000,
		[pixelsPerSecond],
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (!svgRef.current) {
				return;
			}
			const rect = svgRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			const timeMs = xToMs(x);
			const value = yToValue(y);

			if (e.button === 2) {
				// Right-click: remove nearest point
				e.preventDefault();
				if (points.length === 0) {
					return;
				}
				let nearestIdx = 0;
				let nearestDist = Number.POSITIVE_INFINITY;
				for (let i = 0; i < points.length; i++) {
					const px = msToX(points[i].timeMs);
					const py = valueToY(points[i].value);
					const dist = Math.hypot(px - x, py - y);
					if (dist < nearestDist) {
						nearestDist = dist;
						nearestIdx = i;
					}
				}
				if (nearestDist < 15) {
					removePoint(track, parameter, nearestIdx);
				}
				return;
			}

			// Check if clicking near an existing point to drag it
			for (let i = 0; i < points.length; i++) {
				const px = msToX(points[i].timeMs);
				const py = valueToY(points[i].value);
				if (Math.hypot(px - x, py - y) < 10) {
					setDraggingIndex(i);
					return;
				}
			}

			// Otherwise add a new point
			addPoint(
				track,
				parameter,
				Math.round(timeMs),
				Math.round(value * 100) / 100,
			);
		},
		[
			points,
			track,
			parameter,
			addPoint,
			removePoint,
			msToX,
			valueToY,
			xToMs,
			yToValue,
		],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (draggingIndex === null || !svgRef.current) {
				return;
			}
			const rect = svgRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			const timeMs = Math.max(0, xToMs(x));
			const value = Math.min(max, Math.max(min, yToValue(y)));
			movePoint(
				track,
				parameter,
				draggingIndex,
				Math.round(timeMs),
				Math.round(value * 100) / 100,
			);
		},
		[draggingIndex, track, parameter, min, max, movePoint, xToMs, yToValue],
	);

	const handleMouseUp = useCallback(() => {
		setDraggingIndex(null);
	}, []);

	// Build the path for the automation curve
	const buildPath = () => {
		if (points.length === 0) {
			return "";
		}

		// Start with default value at time 0
		let d = `M 0 ${valueToY(defaultValue)}`;

		// Horizontal line to first point
		d += ` L ${msToX(points[0].timeMs)} ${valueToY(defaultValue)}`;

		// Line through each point
		for (const pt of points) {
			d += ` L ${msToX(pt.timeMs)} ${valueToY(pt.value)}`;
		}

		// Horizontal line to end
		d += ` L ${totalWidth} ${valueToY(points[points.length - 1].value)}`;

		return d;
	};

	// Current value indicator
	const currentX = msToX(currentTimeMs);
	const currentValue = interpolateValue(points, currentTimeMs, defaultValue);
	const currentY = valueToY(currentValue);

	return (
		<svg
			ref={svgRef}
			className="absolute inset-0 w-full h-full cursor-crosshair"
			style={{ height: `${height}px`, top: "4px" }}
			role="img"
			aria-label={`${parameter} automation lane`}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			onContextMenu={(e) => e.preventDefault()}
		>
			{/* Grid lines */}
			{[0.25, 0.5, 0.75].map((ratio) => (
				<line
					key={ratio}
					x1={0}
					y1={height * ratio}
					x2={totalWidth}
					y2={height * ratio}
					stroke="currentColor"
					strokeOpacity={0.1}
					strokeWidth={0.5}
				/>
			))}

			{/* Default value line */}
			<line
				x1={0}
				y1={valueToY(defaultValue)}
				x2={totalWidth}
				y2={valueToY(defaultValue)}
				stroke="currentColor"
				strokeOpacity={0.2}
				strokeWidth={0.5}
				strokeDasharray="4 4"
			/>

			{/* Automation curve */}
			{points.length > 0 && (
				<path
					d={buildPath()}
					fill="none"
					stroke="hsl(var(--primary))"
					strokeWidth={1.5}
					strokeOpacity={0.8}
				/>
			)}

			{/* Points */}
			{points.map((pt, i) => (
				<circle
					key={`${pt.timeMs}-${pt.value}`}
					cx={msToX(pt.timeMs)}
					cy={valueToY(pt.value)}
					r={draggingIndex === i ? 5 : 3.5}
					fill={
						draggingIndex === i
							? "hsl(var(--primary))"
							: "hsl(var(--background))"
					}
					stroke="hsl(var(--primary))"
					strokeWidth={1.5}
					className="cursor-grab active:cursor-grabbing"
				/>
			))}

			{/* Current time indicator */}
			{points.length > 0 && (
				<circle
					cx={currentX}
					cy={currentY}
					r={3}
					fill="hsl(var(--destructive))"
					stroke="none"
					pointerEvents="none"
				/>
			)}
		</svg>
	);
}

export { interpolateValue };
