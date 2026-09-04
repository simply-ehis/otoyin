import { ClockIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Card, CardBody, CardTitle } from "@/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ScreenHeader } from "@/ui/states";
import { apiClient } from "@/lib/api/client";
import { debug } from "@/lib/utils/debug";

const FALLBACK_FPS = [23.976, 24, 25, 29.97, 30];

function formatSmpte(seconds: number, fps: number): string {
	const totalFrames = Math.round(seconds * fps);
	const hh = Math.floor(totalFrames / (3600 * fps));
	const mm = Math.floor((totalFrames % (3600 * fps)) / (60 * fps));
	const ss = Math.floor((totalFrames % (60 * fps)) / fps);
	const ff = totalFrames % fps;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

/**
 * SMPTE timecode readout with frame-rate picker. Server-converted when
 * reachable, local fallback otherwise. Doubles as the embeddable player
 * timecode widget (currentTimeMs / durationMs props).
 */
export function TimecodeDisplay({
	currentTimeMs = 0,
	durationMs = 0,
	standalone = false,
}: {
	currentTimeMs?: number;
	durationMs?: number;
	standalone?: boolean;
}) {
	const [frameRates, setFrameRates] = useState<number[]>(FALLBACK_FPS);
	const [fps, setFps] = useState(24);
	const [serverTimecode, setServerTimecode] = useState<string | null>(null);

	useEffect(() => {
		apiClient
			.listTimecodeFrameRates()
			.then((data: number[]) => {
				if (data.length > 0) {
					setFrameRates(data);
				}
			})
			.catch((err: unknown) => {
				debug.warn("[timecode] list frame rates failed:", err);
			});
	}, []);

	useEffect(() => {
		const seconds = currentTimeMs / 1000;
		apiClient
			.convertToTimecode(seconds, fps)
			.then((data: { timecode: string }) => {
				setServerTimecode(data.timecode);
			})
			.catch((err: unknown) => {
				debug.warn("[timecode] convert failed:", err);
				setServerTimecode(formatSmpte(seconds, fps));
			});
	}, [currentTimeMs, fps]);

	const readout = (
		<div className="flex items-center gap-3">
			<p className="font-mono text-2xl tabular-nums tracking-wider text-foreground">
				{serverTimecode ?? formatSmpte(currentTimeMs / 1000, fps)}
			</p>
			<span aria-hidden="true" className="text-sm text-muted-foreground">/</span>
			<p className="font-mono text-sm tabular-nums text-muted-foreground">
				{formatSmpte(durationMs / 1000, fps)}
			</p>
			<Select value={String(fps)} onValueChange={(v) => setFps(Number(v))}>
				<SelectTrigger className="ml-auto w-[100px]" aria-label="Frame rate">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{frameRates.map((rate) => (
						<SelectItem key={rate} value={String(rate)}>
							{rate} fps
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);

	if (!standalone) {
		return readout;
	}
	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<ScreenHeader
				title="Timecode"
				description="SMPTE readout for the current transport position."
			/>
			<Card>
				<CardTitle className="flex items-center gap-2">
					<ClockIcon className="size-4 text-muted-foreground" aria-hidden="true" />
					Timecode
				</CardTitle>
				<CardBody className="mt-3">{readout}</CardBody>
			</Card>
		</div>
	);
}

/** Route component for /settings/timecode. */
export function TimecodeSettingsPage() {
	return <TimecodeDisplay standalone />;
}
