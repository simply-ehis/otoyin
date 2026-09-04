import { useEffect, useState } from "react";
import {
	CapturePill,
	type PillState,
} from "@/components/CapturePill/CapturePill";
import { cn } from "@/lib/utils/cn";

const PILL_SEQUENCE: PillState[] = [
	"recording",
	"transcribing",
	"refining",
	"rest",
];
const PILL_DURATIONS: Partial<Record<PillState, number>> = {
	recording: 2600,
	transcribing: 1500,
	refining: 1500,
	rest: 900,
};

export function HotkeyPillPreview({ enabled }: { enabled: boolean }) {
	const [state, setState] = useState<PillState>("recording");
	const [tick, setTick] = useState(0);

	useEffect(() => {
		const t = window.setTimeout(() => {
			const next =
				PILL_SEQUENCE[
					(PILL_SEQUENCE.indexOf(state) + 1) % PILL_SEQUENCE.length
				];
			setState(next);
		}, PILL_DURATIONS[state] ?? 1000);
		return () => window.clearTimeout(t);
	}, [state]);

	useEffect(() => {
		if (state !== "recording") {
			return;
		}
		setTick(0);
		const iv = window.setInterval(() => setTick((n) => n + 1), 90);
		return () => window.clearInterval(iv);
	}, [state]);

	const elapsedMs = tick * 90;

	return (
		<div
			className={cn(
				"relative rounded-xl border overflow-hidden transition-opacity",
				"bg-muted/30",
				"aspect-[6/1]",
				enabled ? "border-border" : "border-border/50 opacity-50",
			)}
			style={{
				backgroundImage: `
     linear-gradient(to right, hsl(var(--foreground) / 0.06) 1px, transparent 1px),
     linear-gradient(to bottom, hsl(var(--foreground) / 0.06) 1px, transparent 1px)
    `,
				backgroundSize: "22px 22px",
			}}
		>
			<div className="absolute inset-0 flex items-center justify-center">
				<CapturePill state={state} elapsedMs={elapsedMs} />
			</div>
		</div>
	);
}
