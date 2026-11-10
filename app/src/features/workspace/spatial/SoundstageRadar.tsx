import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { SpatialSource } from "./types";

const CX = 200;
const CY = 150;
const NUDGE = 5;

export function SoundstageRadar({
	sources,
	dragging,
	onDragStart,
	onDragMove,
	onDragEnd,
}: {
	sources: SpatialSource[];
	dragging: string | null;
	onDragStart: (id: string) => void;
	onDragMove: (x: number, y: number) => void;
	onDragEnd: () => void;
}) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [focusedId, setFocusedId] = useState<string | null>(null);

	const toStage = useCallback((clientX: number, clientY: number) => {
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect) {
			return null;
		}
		return {
			x: Math.max(20, Math.min(380, clientX - rect.left)),
			y: Math.max(20, Math.min(280, clientY - rect.top)),
		};
	}, []);

	function handleKeyDown(e: React.KeyboardEvent) {
		const id = focusedId ?? sources.find((s) => !s.muted)?.id ?? sources[0]?.id;
		if (!id) {
			return;
		}
		const deltas: Record<string, [number, number]> = {
			ArrowLeft: [-NUDGE, 0],
			ArrowRight: [NUDGE, 0],
			ArrowUp: [0, -NUDGE],
			ArrowDown: [0, NUDGE],
		};
		const d = deltas[e.key];
		if (!d) {
			return;
		}
		e.preventDefault();
		const target = sources.find((s) => s.id === id);
		if (!target) {
			return;
		}
		onDragMove(
			Math.max(20, Math.min(380, target.x + d[0])),
			Math.max(20, Math.min(280, target.y + d[1])),
		);
	}

	return (
		<section className="rounded-md border border-border bg-card p-3">
			<h2 className="mb-2 text-xs text-muted-foreground">
				Soundstage — drag to position, or focus and use arrow keys
			</h2>
			<svg
				ref={svgRef}
				viewBox="0 0 400 300"
				className="h-48 w-full cursor-crosshair select-none rounded-md bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard nudging via onKeyDown below
				tabIndex={0}
				aria-label="Soundstage. Arrow keys nudge the focused source."
				onMouseMove={(e) => {
					if (!dragging) {
						return;
					}
					const p = toStage(e.clientX, e.clientY);
					if (p) {
						onDragMove(p.x, p.y);
					}
				}}
				onMouseUp={onDragEnd}
				onMouseLeave={onDragEnd}
				onKeyDown={handleKeyDown}
			>
				<title>Soundstage spatial view</title>
				{[60, 120].map((r) => (
					<circle
						key={r}
						cx={CX}
						cy={CY}
						r={r}
						fill="none"
						className="stroke-border"
						strokeWidth="0.5"
						strokeDasharray="4 4"
					/>
				))}
				<line
					x1={CX}
					y1={20}
					x2={CX}
					y2={280}
					className="stroke-border"
					strokeWidth="0.5"
				/>
				<line
					x1={20}
					y1={CY}
					x2={380}
					y2={CY}
					className="stroke-border"
					strokeWidth="0.5"
				/>
				<circle cx={CX} cy={CY} r={6} className="fill-accent" />
				<text
					x={CX}
					y={CY + 16}
					textAnchor="middle"
					className="fill-muted-foreground"
					fontSize="8"
				>
					Listener
				</text>
				{sources.map((s) => (
					// biome-ignore lint/a11y/noStaticElementInteractions: drag handle; keyboard equivalent is the focus-button list below
					<g
						key={s.id}
						onMouseDown={() => {
							setFocusedId(s.id);
							onDragStart(s.id);
						}}
						className="cursor-grab active:cursor-grabbing"
					>
						<circle
							cx={s.x}
							cy={s.y}
							r={10}
							className={s.muted ? "fill-muted" : "fill-secondary"}
							opacity={s.muted ? 0.4 : 0.9}
						/>
						<circle
							cx={s.x}
							cy={s.y}
							r={5}
							className={s.muted ? "fill-muted-foreground" : "fill-accent"}
						/>
						<text
							x={s.x}
							y={s.y + 18}
							textAnchor="middle"
							className="fill-foreground"
							fontSize="9"
						>
							{s.label}
						</text>
					</g>
				))}
			</svg>
			<div className="mt-2 flex flex-wrap gap-2" aria-hidden="true">
				{sources.map((s) => (
					<span
						key={s.id}
						className="text-xs tabular-nums text-muted-foreground"
					>
						{s.label}: ({Math.round(s.x)}, {Math.round(s.y)})
					</span>
				))}
			</div>
			<div className="mt-2 flex flex-wrap gap-2">
				{sources.map((s) => (
					<button
						key={s.id}
						type="button"
						aria-pressed={focusedId === s.id}
						className={cn(
							"rounded-sm border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							focusedId === s.id
								? "border-accent bg-accent-muted text-foreground"
								: "border-border text-muted-foreground hover:text-foreground",
						)}
						title={`Focus ${s.label} for arrow-key positioning`}
						onClick={() => setFocusedId(s.id)}
					>
						{s.label}
					</button>
				))}
			</div>
		</section>
	);
}
