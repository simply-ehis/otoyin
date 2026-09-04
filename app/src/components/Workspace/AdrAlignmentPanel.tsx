import {
	ExclamationTriangleIcon as AlertTriangle,
	PlayIcon as Play,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api/client";
import type { ADRSession } from "./ADRViewTypes";

interface AdrAlignmentPanelProps {
	session: ADRSession;
	sid: string;
	hasGuide: boolean;
	guideWaveform: number[];
	playAudio: (url: string) => void;
}

export function AdrAlignmentPanel({
	session,
	sid,
	hasGuide,
	guideWaveform,
	playAudio,
}: AdrAlignmentPanelProps) {
	return (
		<>
			{session?.guide_audio_path && (
				<div className="rounded-lg border border-border bg-card p-3">
					<div className="flex items-center justify-between mb-2">
						<span className="text-xs font-medium text-foreground">
							Guide Track
						</span>
						{session.guide_duration_ms != null &&
							session.guide_duration_ms > 0 && (
								<Badge variant="secondary" className="text-xs">
									{((session.guide_duration_ms ?? 0) / 1000).toFixed(2)}s
								</Badge>
							)}
					</div>
					<div className="h-16 rounded bg-muted/50 flex items-center gap-px px-1">
						{guideWaveform.length > 0 ? (
							guideWaveform
								.map((s, i) => ({ s, k: i }))
								.map(({ s, k }) => (
									<div
										key={k}
										className="flex-1 rounded-full"
										style={{
											height: `${Math.max(5, s * 80)}%`,
											background: "hsl(var(--accent) / 0.4)",
										}}
									/>
								))
						) : (
							<Spinner label="Loading waveform…" />
						)}
					</div>
					<button
						type="button"
						className="text-xs text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1"
						onClick={() => playAudio(apiClient.getADRGuideAudioUrl(sid))}
					>
						<Play className="size-3" /> Play guide
					</button>
				</div>
			)}

			{!hasGuide && session && (
				<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
					<AlertTriangle className="size-3.5 shrink-0" />
					Guide track required — import a guide before recording takes or
					aligning. Scoring and auto-select work, but alignment is most
					meaningful with a guide.
				</div>
			)}
		</>
	);
}
