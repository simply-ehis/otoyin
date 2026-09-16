import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import type { StudioTrack } from "./AudioStudioStore";
import type { StitchCurve, StitchOptions } from "./useStudioStitch";

const CURVES: Array<{ value: StitchCurve; label: string }> = [
	{ value: "equal_power", label: "Equal power (natural)" },
	{ value: "linear", label: "Linear (straight)" },
	{ value: "exponential", label: "Exponential (slow start)" },
];

/** Stitch the selected track end-to-end with another track (crossfade + gap + curve). */
export function StitchDialog({
	open,
	onClose,
	tracks,
	sourceTrackId,
	stitching,
	onStitch,
}: {
	open: boolean;
	onClose: () => void;
	tracks: StudioTrack[];
	sourceTrackId: string | null;
	stitching: boolean;
	onStitch: (targetId: string, opts: StitchOptions) => void;
}) {
	const source = tracks.find((t) => t.id === sourceTrackId) ?? null;
	const candidates = tracks.filter(
		(t) => t.id !== sourceTrackId && (t.audioBlob || t.audioUrl),
	);
	const [targetId, setTargetId] = useState("");
	const [crossfadeMs, setCrossfadeMs] = useState(200);
	const [gapMs, setGapMs] = useState(0);
	const [curve, setCurve] = useState<StitchCurve>("equal_power");

	useEffect(() => {
		if (open) {
			const first = tracks.find(
				(t) => t.id !== sourceTrackId && (t.audioBlob || t.audioUrl),
			);
			setTargetId(first?.id ?? "");
			setCrossfadeMs(200);
			setGapMs(0);
			setCurve("equal_power");
		}
		// Reset each time the dialog opens (or the track list changes under it).
	}, [open, tracks, sourceTrackId]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<button
				type="button"
				tabIndex={-1}
				className="absolute inset-0 cursor-default"
				onClick={onClose}
				aria-label="Close stitch dialog"
			/>
			<div
				className="relative w-80 rounded-md border border-border bg-card p-4 shadow-lg"
				role="dialog"
				aria-label="Stitch tracks"
			>
				<h2 className="text-sm font-medium">Stitch tracks</h2>
				<p className="mt-0.5 text-[11px] text-muted-foreground">
					{source ? (
						<>
							Append a track after{" "}
							<span className="font-medium">{source.name}</span> with a
							crossfade. The result lands on a new track.
						</>
					) : (
						"Select a track first, then stitch."
					)}
				</p>

				<label
					htmlFor="stitch-target"
					className="mt-3 block text-[11px] text-muted-foreground"
				>
					Append track
				</label>
				<Select value={targetId} onValueChange={setTargetId}>
					<SelectTrigger id="stitch-target" className="mt-1 h-7 w-full text-xs">
						<SelectValue placeholder="Choose a track" />
					</SelectTrigger>
					<SelectContent>
						{candidates.map((t) => (
							<SelectItem key={t.id} value={t.id}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="mt-3 flex items-center justify-between text-[11px]">
					<label htmlFor="stitch-xfade" className="text-muted-foreground">
						Crossfade
					</label>
					<span className="tabular-nums">{crossfadeMs} ms</span>
				</div>
				<Slider
					id="stitch-xfade"
					min={0}
					max={2000}
					step={10}
					value={[crossfadeMs]}
					onValueChange={([v]) => setCrossfadeMs(v)}
					className="mt-1 h-4 w-full"
					aria-label="Crossfade duration in milliseconds"
				/>

				<div className="mt-2 flex items-center justify-between text-[11px]">
					<label htmlFor="stitch-gap" className="text-muted-foreground">
						Gap of silence
					</label>
					<span className="tabular-nums">{gapMs} ms</span>
				</div>
				<Slider
					id="stitch-gap"
					min={0}
					max={2000}
					step={50}
					value={[gapMs]}
					onValueChange={([v]) => setGapMs(v)}
					className="mt-1 h-4 w-full"
					aria-label="Gap of silence in milliseconds"
				/>

				<label
					htmlFor="stitch-curve"
					className="mt-3 block text-[11px] text-muted-foreground"
				>
					Fade curve
				</label>
				<Select value={curve} onValueChange={(v) => setCurve(v as StitchCurve)}>
					<SelectTrigger id="stitch-curve" className="mt-1 h-7 w-full text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CURVES.map((c) => (
							<SelectItem key={c.value} value={c.value}>
								{c.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="mt-4 flex justify-end gap-2">
					<Button variant="ghost" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={stitching || !source || !targetId}
						onClick={() => {
							if (targetId) {
								onStitch(targetId, { crossfadeMs, gapMs, curve });
							}
						}}
					>
						{stitching ? "Stitching…" : "Stitch"}
					</Button>
				</div>
			</div>
		</div>
	);
}
