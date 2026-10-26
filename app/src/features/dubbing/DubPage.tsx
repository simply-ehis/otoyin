import { FilmIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { DubJobResponse, DubSegment } from "@/lib/api/clientDubbing";
import { dubbingClient } from "@/lib/api/clientDubbing";
import { Button } from "@/ui/button";
import { ScreenHeader } from "@/ui/states";
import { DubbingTab } from "./DubbingTab";
import { DubTimeline } from "./DubTimeline";

export function DubPage() {
	// Allow `?job=<job_id>` to load an existing dub job's segments into the
	// timeline. Without it the page falls back to the empty-state wizard.
	const jobId = new URL(window.location.href).searchParams.get("job");

	const { data: job } = useQuery<DubJobResponse>({
		queryKey: ["dub-job", jobId ?? null],
		queryFn: () => dubbingClient.getDubJob(jobId as string),
		enabled: Boolean(jobId),
		staleTime: 15_000,
	});

	const [segments, setSegments] = useState<DubSegment[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);

	const handleSegmentUpdated = useCallback((updated: DubSegment) => {
		setSegments((prev) =>
			prev.map((s) => (s.id === updated.id ? updated : s)),
		);
	}, []);

	// Derive timing metadata from the job payload when available.
	// API returns duration in ms; timeline works in seconds.
	const mediaDuration = useMemo(
		() => (job?.duration !== undefined ? job.duration / 1000 : undefined),
		[job?.duration],
	);
	const onsets = useMemo(() => {
		if (!job?.segments) {
			return [];
		}
		const set = new Set<number>();
		for (const s of job.segments) {
			set.add(s.start);
			set.add(s.end);
		}
		return [...set].sort((a, b) => a - b);
	}, [job?.segments]);

	// Load job segments into local state on fetch.
	useEffect(() => {
		if (job?.segments) {
			setSegments(job.segments);
			setSelectedId(job.segments[0]?.id ?? null);
		}
	}, [job?.segments]);

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
						<DubbingTab />
					</div>
					<DubTimeline
						segments={segments}
						disabled={segments.length === 0}
						mediaDuration={mediaDuration}
						onsets={onsets}
						selectedId={selectedId}
						onSelect={setSelectedId}
						onSegmentsChange={setSegments}
						onSegmentUpdated={handleSegmentUpdated}
					/>
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
