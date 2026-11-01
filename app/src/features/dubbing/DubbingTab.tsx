import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	FilmIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type {
	DubJobResponse,
	DubPreviewResponse,
} from "@/lib/api/clientDubbing";
import type {
	ModelStatusListResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";
import { DUB_ENGINES, TTS_ENGINES } from "@/lib/constants/engines";
import { useFirstDownloadedTtsEngine } from "@/lib/hooks/useFirstDownloadedTtsEngine";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Field } from "@/ui/input";
import { Badge } from "@/ui/primitives";
import { Progress } from "@/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ErrorState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

const VIDEO_EXTENSIONS = ".mp4,.mov,.mkv,.webm,.avi";
const STEPS = ["upload", "preview", "configure", "dubbing", "done"] as const;
type DubStep = (typeof STEPS)[number];

/**
 * Video dubbing wizard: upload → transcript preview → voice/engine
 * config → progress → download. Enter advances, Escape cancels.
 */
export function DubbingTab() {
	const { toast } = useToast();
	const fileRef = useRef<HTMLInputElement>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
	const firstEngine = useFirstDownloadedTtsEngine();

	const [step, setStep] = useState<DubStep>("upload");
	const [videoPath, setVideoPath] = useState<string | null>(null);
	const [videoName, setVideoName] = useState("");
	const [preview, setPreview] = useState<DubPreviewResponse | null>(null);
	const [targetLang, setTargetLang] = useState("es");
	const [profileId, setProfileId] = useState("");
	const [engine, setEngine] = useState(
		DUB_ENGINES.find((e) => e === firstEngine) ?? "",
	);
	const [numSpeakers, setNumSpeakers] = useState("auto");
	const [job, setJob] = useState<DubJobResponse | null>(null);

	const { data: modelStatus } = useQuery<ModelStatusListResponse>({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
		refetchInterval: 30_000,
	});
	const downloadedEngines = (() => {
		const downloaded = new Set(
			(modelStatus?.models ?? [])
				.filter((m) => m.downloaded && m.category === "tts")
				.map((m) => m.engine),
		);
		return DUB_ENGINES.filter((e) => downloaded.has(e));
	})();
	const { data: languages } = useQuery({
		queryKey: ["dubbing-languages"],
		queryFn: () => apiClient.getDubbingLanguages(),
	});
	const { data: profiles } = useQuery({
		queryKey: ["profiles"],
		queryFn: () => apiClient.listProfiles(),
	});

	const previewMutation = useMutation({
		mutationFn: (params: {
			video_path: string;
			source_lang?: string | null;
			num_speakers?: number | null;
		}) => apiClient.previewDub(params),
		onSuccess: (data) => {
			setPreview(data);
			setStep("preview");
		},
		onError: (error: Error) =>
			toast({
				title: "Preview failed",
				description: error.message,
				variant: "destructive",
			}),
	});
	const dubMutation = useMutation({
		mutationFn: (params: {
			video_path: string;
			target_lang: string;
			profile_id: string;
			engine: string;
			num_speakers?: number | null;
		}) => apiClient.startDub(params),
		onSuccess: (data) => {
			setStep("dubbing");
			pollJob(data.job_id);
		},
		onError: (error: Error) =>
			toast({
				title: "Dubbing failed to start",
				description: error.message,
				variant: "destructive",
			}),
	});

	const pollJob = useCallback(
		(jobId: string) => {
			if (pollRef.current) {
				clearInterval(pollRef.current);
			}
			pollRef.current = setInterval(async () => {
				try {
					const status = await apiClient.getDubJob(jobId);
					setJob(status);
					if (status.status === "done" || status.status === "failed") {
						if (pollRef.current) {
							clearInterval(pollRef.current);
						}
						setStep(status.status === "done" ? "done" : "configure");
						toast(
							status.status === "done"
								? {
										title: "Dubbing complete",
										description: "Your dubbed video is ready.",
									}
								: {
										title: "Dubbing failed",
										description: status.error || "Unknown error",
										variant: "destructive",
									},
						);
					}
				} catch {
					// Transient poll failure — keep polling.
				}
			}, 2000);
		},
		[toast],
	);

	useEffect(
		() => () => {
			if (pollRef.current) {
				clearInterval(pollRef.current);
			}
		},
		[],
	);

	const reset = useCallback(() => {
		setStep("upload");
		setVideoPath(null);
		setVideoName("");
		setPreview(null);
		setJob(null);
		if (fileRef.current) {
			fileRef.current.value = "";
		}
	}, []);

	const startDub = useCallback(() => {
		if (!videoPath || !profileId) {
			return;
		}
		dubMutation.mutate({
			video_path: videoPath,
			target_lang: targetLang,
			profile_id: profileId,
			engine,
			num_speakers:
				numSpeakers === "auto" ? null : Number.parseInt(numSpeakers, 10),
		});
	}, [videoPath, profileId, targetLang, engine, numSpeakers, dubMutation]);

	const download = useCallback(async () => {
		if (!job?.job_id) {
			return;
		}
		try {
			const blob = await apiClient.downloadDubbedVideo(job.job_id);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `dubbed_${videoName || "video"}.mp4`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (error: unknown) {
			toast({
				title: "Download failed",
				description: String(error),
				variant: "destructive",
			});
		}
	}, [job, videoName, toast]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				if (step === "dubbing" && job?.job_id) {
					void apiClient.cancelDub(job.job_id);
					reset();
					toast({ title: "Dubbing cancelled" });
				} else if (step !== "upload") {
					reset();
				}
				return;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				if (step === "preview") {
					setStep("configure");
				} else if (step === "configure" && profileId && videoPath) {
					startDub();
				} else if (step === "done") {
					void download();
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		step,
		profileId,
		videoPath,
		job?.job_id,
		download,
		reset,
		startDub,
		toast,
	]);

	const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}
		setVideoName(file.name);
		const path = (file as unknown as { path?: string }).path || file.name;
		setVideoPath(path);
		setStep("configure");
		previewMutation.mutate({ video_path: path });
	};

	const hint: Record<DubStep, string | null> = {
		upload: null,
		preview: "Enter → Continue",
		configure: profileId ? "Enter → Start dubbing" : null,
		dubbing: "Esc → Cancel",
		done: "Enter → Download · Esc → Reset",
	};
	const speakers = preview?.detected_speakers?.length ?? 0;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<ScreenHeader title="Video dubbing" />
			<div className="mt-4 min-h-0 flex-1 space-y-6 overflow-y-auto pb-4">
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span className="sr-only">
						Step {STEPS.indexOf(step) + 1} of {STEPS.length}: current step{" "}
						{step}.{" "}
					</span>
					{STEPS.map((s, i) => (
						<span key={s} className="flex items-center gap-1.5">
							{i > 0 ? (
								<span aria-hidden="true" className="text-muted-foreground/50">
									→
								</span>
							) : null}
							<span
								className={cn(
									"rounded-sm px-2 py-1 font-medium",
									step === s
										? "bg-accent text-white"
										: "bg-secondary text-muted-foreground",
								)}
								aria-current={step === s ? "step" : undefined}
							>
								{i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
							</span>
						</span>
					))}
					{hint[step] ? (
						<span className="ml-auto font-mono text-muted-foreground/70">
							{hint[step]}
						</span>
					) : null}
				</p>

				{(step === "upload" || step === "configure") && (
					<div className="flex flex-col gap-4">
						<label
							className="flex cursor-pointer flex-col items-center gap-3 rounded-md border-2 border-dashed border-strong p-8 text-center transition-colors hover:border-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring"
							onDragOver={(e) => {
								if (e.dataTransfer?.types.includes("Files")) {
									e.preventDefault();
								}
							}}
							onDrop={(e) => {
								const file = e.dataTransfer?.files?.[0];
								if (!file) {
									return;
								}
								e.preventDefault();
								pickFile({
									target: { files: [file] },
								} as unknown as React.ChangeEvent<HTMLInputElement>);
							}}
						>
							<input
								ref={fileRef}
								type="file"
								accept={VIDEO_EXTENSIONS}
								className="hidden"
								aria-label="Video file"
								onChange={pickFile}
							/>
							<FilmIcon
								className="size-10 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="text-sm text-muted-foreground">
								{videoName || "Drop a video file or click to browse"}
							</span>
							<span className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground">
								<ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />
								Choose video
							</span>
						</label>
						{videoPath ? (
							<p className="text-sm text-muted-foreground">
								Selected:{" "}
								<span className="font-medium text-foreground">{videoName}</span>
							</p>
						) : null}
					</div>
				)}

				{step === "preview" && preview ? (
					<section
						aria-label="Transcript preview"
						className="flex flex-col gap-3"
					>
						<p className="flex items-center justify-between">
							<span className="text-sm font-medium text-foreground">
								Transcript preview
							</span>
							<span className="text-xs tabular-nums text-muted-foreground">
								{preview.segments.length} segments · {speakers} speaker
								{speakers === 1 ? "" : "s"}
							</span>
						</p>
						<ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-3">
							{preview.segments.map((seg) => (
								<li key={seg.id} className="flex gap-2 text-xs">
									<span className="w-16 shrink-0 font-mono tabular-nums text-muted-foreground">
										{seg.start.toFixed(1)}s
									</span>
									<span className="w-16 shrink-0 truncate text-accent">
										{seg.speaker}
									</span>
									<span className="text-foreground">{seg.text}</span>
								</li>
							))}
						</ul>
						<div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setStep("configure")}
							>
								Continue to configuration
							</Button>
						</div>
					</section>
				) : null}

				{(step === "configure" || step === "preview") && (
					<section
						aria-label="Dubbing settings"
						className="flex max-w-4xl flex-col gap-4"
					>
						<h3 className="text-sm font-medium text-foreground">
							Dubbing settings
						</h3>
						<div className="grid grid-cols-2 gap-4">
							<Field label="Target language" htmlFor="dub-lang">
								<Select value={targetLang} onValueChange={setTargetLang}>
									<SelectTrigger id="dub-lang">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{languages &&
											Object.entries(languages).map(([code, name]) => (
												<SelectItem key={code} value={code}>
													{Array.isArray(name) ? name.join(", ") : String(name)}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</Field>
							<Field label="Voice profile" htmlFor="dub-voice">
								<Select value={profileId} onValueChange={setProfileId}>
									<SelectTrigger id="dub-voice">
										<SelectValue placeholder="Select voice…" />
									</SelectTrigger>
									<SelectContent>
										{profiles?.map((p: VoiceProfileResponse) => (
											<SelectItem key={p.id} value={p.id}>
												{p.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						</div>
						<Field label="TTS engine" htmlFor="dub-engine">
							<Select value={engine || undefined} onValueChange={setEngine}>
								<SelectTrigger id="dub-engine">
									<SelectValue placeholder="Select engine" />
								</SelectTrigger>
								<SelectContent>
									{downloadedEngines.map((e) => (
										<SelectItem key={e} value={e}>
											{(TTS_ENGINES as Record<string, string>)[e] ?? e}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field label="Speakers" htmlFor="dub-speakers">
							<Select value={numSpeakers} onValueChange={setNumSpeakers}>
								<SelectTrigger id="dub-speakers">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto-detect</SelectItem>
									<SelectItem value="1">Single speaker</SelectItem>
									<SelectItem value="2">2 speakers</SelectItem>
									<SelectItem value="3">3 speakers</SelectItem>
									<SelectItem value="4">4 speakers</SelectItem>
									<SelectItem value="5">5+ speakers</SelectItem>
								</SelectContent>
							</Select>
						</Field>
						<div className="flex gap-2">
							<Button
								onClick={startDub}
								disabled={!profileId || dubMutation.isPending}
								loading={dubMutation.isPending}
							>
								<SparklesIcon className="mr-2 h-4 w-4" aria-hidden="true" />
								{dubMutation.isPending ? "Starting…" : "Start dubbing"}
							</Button>
							<Button variant="outline" onClick={reset}>
								Reset
							</Button>
						</div>
					</section>
				)}

				{step === "dubbing" && job ? (
					<section
						aria-label="Dubbing progress"
						className="flex max-w-4xl flex-col gap-2"
					>
						<h3 className="text-sm font-medium text-foreground">
							Dubbing progress
						</h3>
						<p className="flex items-center gap-2">
							<Badge tone="neutral">{job.status}</Badge>
							{job.progress !== undefined ? (
								<Progress
									value={job.progress}
									label="Dubbing progress"
									className="h-2 flex-1"
								/>
							) : null}
						</p>
						{job.status === "dubbing" ? (
							<p className="flex items-center gap-2 text-sm text-muted-foreground">
								<FilmIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
								Translating → re-voicing…
							</p>
						) : null}
						{job.status === "failed" && job.error ? (
							<ErrorState title="Dubbing failed" body={job.error} />
						) : null}
					</section>
				) : null}

				{step === "done" && job ? (
					<section
						aria-label="Dubbing complete"
						className="flex max-w-4xl flex-col gap-3"
					>
						<h3 className="text-sm font-medium text-foreground">
							Dubbing complete
						</h3>
						<div className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
							<p className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">
									{videoName || "Dubbed video"}
								</span>
								{job.duration !== undefined ? (
									<span className="text-xs tabular-nums text-muted-foreground">
										{(job.duration / 1000).toFixed(1)}s
									</span>
								) : null}
							</p>
							<span className="flex gap-2">
								<Button onClick={() => void download()}>
									<ArrowDownTrayIcon
										className="mr-2 h-4 w-4"
										aria-hidden="true"
									/>
									Download
								</Button>
								<Button variant="outline" onClick={reset}>
									Start over
								</Button>
							</span>
						</div>
					</section>
				) : null}
			</div>
		</div>
	);
}
