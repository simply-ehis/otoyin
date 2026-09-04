import { useCallback, useRef } from "react";
import type { SoundSource } from "./types";

interface Props {
	sources: SoundSource[];
	dragging: string | null;
	onDragStart: (id: string) => void;
	onDragMove: (x: number, y: number) => void;
	onDragEnd: () => void;
}

const CX = 200;
const CY = 150;

export function SoundstageRadar({
	sources,
	dragging,
	onDragStart,
	onDragMove,
	onDragEnd,
}: Props) {
	const svgRef = useRef<SVGSVGElement>(null);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (!dragging || !svgRef.current) {
				return;
			}
			const rect = svgRef.current.getBoundingClientRect();
			const x = Math.max(20, Math.min(380, e.clientX - rect.left));
			const y = Math.max(20, Math.min(280, e.clientY - rect.top));
			onDragMove(x, y);
		},
		[dragging, onDragMove],
	);

	return (
		<div className="rounded-lg border border-border bg-card p-3">
			<p className="text-xs text-muted-foreground/60 mb-2">
				Soundstage — drag to position
			</p>
			<svg
				ref={svgRef}
				viewBox="0 0 400 300"
				className="w-full h-48 rounded bg-muted/20 cursor-crosshair select-none"
				onMouseMove={handleMouseMove}
				onMouseUp={onDragEnd}
				onMouseLeave={onDragEnd}
				role="img"
				aria-label="Soundstage spatial view"
			>
				<title>Soundstage spatial view</title>
				{[60, 120].map((r) => (
					<circle
						key={r}
						cx={CX}
						cy={CY}
						r={r}
						fill="none"
						stroke="hsl(var(--border))"
						strokeWidth="0.5"
						strokeDasharray="4 4"
					/>
				))}
				<line
					x1={CX}
					y1={20}
					x2={CX}
					y2={280}
					stroke="hsl(var(--border))"
					strokeWidth="0.5"
				/>
				<line
					x1={20}
					y1={CY}
					x2={380}
					y2={CY}
					stroke="hsl(var(--border))"
					strokeWidth="0.5"
				/>
				<circle cx={CX} cy={CY} r={6} fill="hsl(var(--accent))" opacity={0.6} />
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
					// biome-ignore lint/a11y/noStaticElementInteractions: drag-to-position
					<g
						key={s.id}
						onMouseDown={() => onDragStart(s.id)}
						className="cursor-grab active:cursor-grabbing"
					>
						<circle
							cx={s.x}
							cy={s.y}
							r={10}
							fill={s.muted ? "hsl(var(--muted))" : "hsl(var(--foreground))"}
							opacity={s.muted ? 0.15 : 0.25}
						/>
						<circle
							cx={s.x}
							cy={s.y}
							r={5}
							fill={
								s.muted ? "hsl(var(--muted-foreground))" : "hsl(var(--accent))"
							}
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
			<div className="flex gap-2 mt-2 flex-wrap">
				{sources.map((s) => (
					<span key={s.id} className="text-xs text-muted-foreground">
						{s.label}: ({Math.round(s.x)}, {Math.round(s.y)})
					</span>
				))}
			</div>
		</div>
	);
}
