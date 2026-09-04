interface PlayheadProps {
	leftPx: number;
}

export function Playhead({ leftPx }: PlayheadProps) {
	return (
		<div
			className="absolute top-0 bottom-0 w-1 bg-accent z-30 pointer-events-none rounded-full"
			style={{ left: `${leftPx}px` }}
		>
			<div className="absolute -top-1 left-1/2 -translate-x-1/2 size-3 bg-accent rounded-full" />
		</div>
	);
}
