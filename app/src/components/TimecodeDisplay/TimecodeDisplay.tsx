import { ClockIcon as Clock } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";

interface TimecodeDisplayProps {
	currentTimeMs?: number;
	durationMs?: number;
}

function formatSMPTE(seconds: number, fps: number): string {
	const totalFrames = Math.round(seconds * fps);
	const hh = Math.floor(totalFrames / (3600 * fps));
	const mm = Math.floor((totalFrames % (3600 * fps)) / (60 * fps));
	const ss = Math.floor((totalFrames % (60 * fps)) / fps);
	const ff = totalFrames % fps;
	return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

export function TimecodeDisplay({
	currentTimeMs = 0,
	durationMs = 0,
}: TimecodeDisplayProps) {
	const [frameRates, setFrameRates] = useState<number[]>([]);
	const [selectedFps, setSelectedFps] = useState(24);
	const [serverTimecode, setServerTimecode] = useState<string | null>(null);

	useEffect(() => {
		apiClient
			.listTimecodeFrameRates()
			.then((data: number[]) => {
				setFrameRates(data);
			})
			.catch((err) => {
				debug.warn("[timecode] list frame rates failed:", err);
				setFrameRates([23.976, 24, 25, 29.97, 30]);
			});
	}, []);

	useEffect(() => {
		const currentSec = currentTimeMs / 1000;
		apiClient
			.convertToTimecode(currentSec, selectedFps)
			.then((data: { timecode: string }) => {
				setServerTimecode(data.timecode);
			})
			.catch((err) => {
				debug.warn("[timecode] convert failed:", err);
				setServerTimecode(formatSMPTE(currentSec, selectedFps));
			});
	}, [currentTimeMs, selectedFps]);

	const currentStr =
		serverTimecode || formatSMPTE(currentTimeMs / 1000, selectedFps);
	const durationStr = formatSMPTE(durationMs / 1000, selectedFps);

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Clock className="size-4" />
					Timecode
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex items-center gap-3">
					<div className="font-mono text-2xl tracking-wider tabular-nums">
						{currentStr}
					</div>
					<span className="text-muted-foreground text-sm">/</span>
					<div className="font-mono text-sm text-muted-foreground">
						{durationStr}
					</div>
					<Select
						value={String(selectedFps)}
						onValueChange={(v) => setSelectedFps(Number(v))}
					>
						<SelectTrigger
							className="w-[100px] ml-auto"
							aria-label="Select frame rate"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{frameRates.map((fps) => (
								<SelectItem key={fps} value={String(fps)}>
									{fps} fps
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</CardContent>
		</Card>
	);
}

import { debug } from "../../lib/utils/debug";
