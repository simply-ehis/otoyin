import { ExclamationTriangleIcon, PlayIcon } from "@heroicons/react/24/outline";
import { apiClient } from "@/lib/api/client";
import { Badge, Spinner } from "@/ui/primitives";
import type { ADRSession } from "./types";

export function AlignmentPanel({
	session,
	sid,
	hasGuide,
	guideWaveform,
	playAudio,
}: {
	session: ADRSession;
	sid: string;
	hasGuide: boolean;
	guideWaveform: number[];
	playAudio: (url: string) => void;
}) {
	return (
		<>
			{session?.guide_audio_path ? (
				<section className="rounded-md border border-border bg-card p-3">
					<div className="mb-2 flex items-center justify-between">
						<h2 className="text-xs font-medium text-foreground">Guide Track</h2>
						{session.guide_duration_ms != null &&
						session.guide_duration_ms > 0 ? (
							<Badge tone="neutral">
								{(session.guide_duration_ms / 1000).toFixed(2)}s
							</Badge>
						) : null}
					</div>
					<div className="flex h-16 items-center gap-px overflow-hidden rounded-md bg-secondary px-1">
						{guideWaveform.length > 0 ? (
							guideWaveform.map((s, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: waveform index stable
									key={i}
									aria-hidden="true"
									className="flex-1 rounded-full bg-accent"
									style={{ height: `${Math.max(5, s * 80)}%` }}
								/>
							))
						) : (
							<Spinner size="xs" />
						)}
					</div>
					<button
						type="button"
						className="mt-1 flex items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() => playAudio(apiClient.getADRGuideAudioUrl(sid))}
					>
						<PlayIcon className="size-3" aria-hidden="true" /> Play guide
					</button>
				</section>
			) : null}

			{!hasGuide && session ? (
				<output className="flex items-center gap-2 rounded-md border border-warning bg-warning-soft px-3 py-2 text-xs text-warning-text">
					<ExclamationTriangleIcon
						className="size-3.5 shrink-0"
						aria-hidden="true"
					/>
					Guide track required — import a guide before recording takes. Scoring
					and auto-select work, but alignment needs a guide.
				</output>
			) : null}
		</>
	);
}
