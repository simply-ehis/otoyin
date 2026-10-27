import { FilmIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DubJobResponse, DubSegment } from "@/lib/api/clientDubbing";
import { dubbingClient } from "@/lib/api/clientDubbing";
import { Button } from "@/ui/button";
import { ScreenHeader } from "@/ui/states";
import { DubbingTab } from "./DubbingTab";
import { DubTimeline } from "./DubTimeline";

export function DubPage() {
	// Allow ?job=<job_id> to load an existing dub job's segments into the
	// timeline. Without it the page falls back to the empty-state wizard.
	const jobId = new URL(window.location.href).searchParams.get("job");

	const {
		data: job,
		isLoading,
		error,
	} = useQuery<DubJobResponse>({
		queryKey: ["dub-job", jobId ?? null],
		queryFn: () => dubbingClient.getDubJob(jobId as string),
		enabled: Boolean(jobId),
		staleTime: 15_000,
	});

	const [segments, setSegments] = useState<DubSegment[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [previewingId, setPreviewingId] = useState<number | null>(null);
	const [analyzed, setAnalyzed] = useState<{
		onsets: number[];
		peaks: number[];
		duration: number;
	} | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Derive timing metadata from the job payload when available.
	// API returns duration in ms; timeline works in seconds.
	const jobDurationSec = useMemo(
		() => (job?.duration !== undefined ? job.duration / 1000 : undefined),
		[job?.duration],
	);

	// Prefer real onsets/peaks from the backend analyze endpoint; fall back
	// to client-side derivation when the endpoint is unavailable.
	const backendAnalysis = useMemo(() => {
		if (!jobId || !job?.segments) {
			return null;
		}
		return dubbingClient.analyzeDubJob(jobId);
	}, [jobId, job?.segments]);

	useEffect(() => {
		let cancelled = false;
		backendAnalysis
			?.then((data) => {
				if (!cancelled) {
					setAnalyzed(data);
				}
			})
			.catch(() => {
				// Analyze endpoint may not be deployed yet — client-side
				// fallback in onsets/peaks below covers this.
				setAnalyzed(null);
			});
		return () => {
			cancelled = true;
		};
	}, [backendAnalysis]);

	const onsets = useMemo(() => {
		if (analyzed?.onsets?.length) {
			return analyzed.onsets;
		}
		if (!job?.segments) {
			return [];
		}
		const set = new Set<number>();
		for (const s of job.segments) {
			set.add(s.start);
			set.add(s.end);
		}
		return [...set].sort((a, b) => a - b);
	}, [analyzed, job?.segments]);

	const mediaDuration = analyzed?.duration ?? jobDurationSec;

	const peaks = useMemo(() => {
		if (analyzed?.peaks?.length) {
			return analyzed.peaks;
		}
		if (!job?.segments || !mediaDuration) {
			return [];
		}
		// Client-side peaks fallback: RMS-like envelope from segment audio
		// presence. API does not expose per-segment waveform data yet.
		const resolution = 256;
		const peaks = new Float32Array(resolution).fill(0);
		const scale = resolution / mediaDuration;
		for (const s of job.segments) {
			if (!s.has_audio) {
				continue;
			}
			const start = Math.floor(s.start * scale);
			const end = Math.ceil(s.end * scale);
			for (let i = start; i < end && i < resolution; i++) {
				peaks[i] = Math.max(peaks[i], 0.6);
			}
		}
		return Array.from(peaks);
	}, [analyzed, job?.segments, mediaDuration]);

	// Load job segments into local state on fetch.
	useEffect(() => {
		if (job?.segments) {
			setSegments(job.segments);
			setSelectedId(job.segments[0]?.id ?? null);
		}
	}, [job?.segments]);

	// Clean up audio on unmount.
	useEffect(() => {
		return () => {
			if (audioRef.current) {
				audioRef.current.pause();
				audioRef.current.src = "";
			}
		};
	}, []);

	const handlePreviewSegment = useCallback(
		async (segment: DubSegment) => {
			if (previewingId === segment.id) {
				// Stop preview.
				if (audioRef.current) {
					audioRef.current.pause();
					audioRef.current.currentTime = 0;
				}
				setPreviewingId(null);
				return;
			}
			if (!jobId) {
				return;
			}
			setPreviewingId(segment.id);
			const audioUrl = dubbingClient.getDubSegmentAudioUrl(jobId, segment.id);
			try {
				const audio = new Audio(audioUrl);
				audioRef.current = audio;
				await audio.play();
			} catch {
				// Audio not yet rendered for this segment — silence is
				// expected until the backend generates it.
				if (previewingId === segment.id) {
					setPreviewingId(null);
				}
			}
		},
		[jobId, previewingId],
	);

	const hasJob = Boolean(jobId && job);
	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<ScreenHeader
				title="Dubbing"
				description="Dub videos with timeline editing"
			/>
			<div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
				<div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
					<div className="flex shrink-0 items-center gap-2">
						<FilmIcon
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						<span className="text-sm font-medium">Workspace</span>
					</div>
					<div className="min-h-0 flex-1 overflow-auto">
						{isLoading && !job ? (
							<div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
								Loading dub job...
							</div>
						) : error && !job ? (
							<div className="flex flex-col items-center justify-center h-full gap-2 text-destructive">
								<p className="text-sm">
									{error instanceof Error ? error.message : String(error)}
								</p>
								<Button
									size="sm"
									variant="outline"
									onClick={() => window.location.reload()}
								>
									Retry
								</Button>
							</div>
						) : hasJob ? (
							<DubTimeline
								segments={segments}
								disabled={segments.length === 0}
								mediaDuration={mediaDuration}
								onsets={onsets}
								peaks={peaks}
								previewingId={previewingId}
								selectedId={selectedId}
								onSelect={setSelectedId}
								onPreviewSegment={handlePreviewSegment}
								onSegmentsChange={setSegments}
							/>
						) : (
							<DubbingTab />
						)}
					</div>
				</div>
				<aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-card p-3 lg:flex">
					<h3 className="text-sm font-medium">Casting board</h3>
					<p className="text-xs text-muted-foreground">
						Assign speakers to voice profiles.
					</p>
					<h3 className="mt-2 text-sm font-medium">Glossary</h3>
					<p className="text-xs text-muted-foreground">
						Term → translation overrides.
					</p>
					<div className="mt-auto">
						<Button size="sm" variant="outline" disabled>
							Export to story
						</Button>
					</div>
				</aside>
			</div>
		</div>
	);
}

export default DubPage;
