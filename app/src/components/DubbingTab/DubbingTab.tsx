import {
	ArrowDownTrayIcon as Download,
	FilmIcon as Film,
	SparklesIcon as Sparkles,
	ArrowUpTrayIcon as Upload,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
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

const VIDEO_EXTENSIONS = ".mp4,.mov,.mkv,.webm,.avi";

type DubStep = "upload" | "preview" | "configure" | "dubbing" | "done";

/**
 * Keyboard shortcuts for the dubbing workflow:
 *  Enter → advance / start / download (step-dependent)
 *  Escape → cancel dubbing or reset
 */
export function DubbingTab() {
	const { toast } = useToast();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

	// Resolve the default TTS engine from downloaded models — do NOT assume kokoro.
	const firstEngine = useFirstDownloadedTtsEngine();
	const { data: modelStatus } = useQuery<ModelStatusListResponse>({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
		refetchInterval: 30_000,
	});
	const downloadedDubEngines = useMemo(() => {
		const downloaded = new Set(
			(modelStatus?.models ?? [])
				.filter((m) => m.downloaded && m.category === "tts")
				.map((m) => m.engine),
		);
		return DUB_ENGINES.filter((e) => downloaded.has(e));
	}, [modelStatus]);

	const [step, setStep] = useState<DubStep>("upload");
	const [videoPath, setVideoPath] = useState<string | null>(null);
	const [videoName, setVideoName] = useState<string>("");
	const [preview, setPreview] = useState<DubPreviewResponse | null>(null);
	const [targetLang, setTargetLang] = useState<string>("es");
	const [profileId, setProfileId] = useState<string>("");
	const [engine, setEngine] = useState<string>(
		DUB_ENGINES.find((e) => e === firstEngine) ?? "",
	);
	const [numSpeakers, setNumSpeakers] = useState<string>("auto");
	const [job, setJob] = useState<DubJobResponse | null>(null);

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
		onError: (error: Error) => {
			toast({
				title: "Preview failed",
				description: error.message,
				variant: "destructive",
			});
		},
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
		onError: (error: Error) => {
			toast({
				title: "Dubbing failed to start",
				description: error.message,
				variant: "destructive",
			});
		},
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
						if (status.status === "done") {
							toast({
								title: "Dubbing complete",
								description: "Your dubbed video is ready.",
							});
						} else {
							toast({
								title: "Dubbing failed",
								description: status.error || "Unknown error",
								variant: "destructive",
							});
						}
					}
				} catch {
					// polling error — ignore transient failures
				}
			}, 2000);
		},
		[toast],
	);

	const handleStartDub = useCallback(() => {
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

	const handleDownload = useCallback(async () => {
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
		} catch (error) {
			toast({
				title: "Download failed",
				description: String(error),
				variant: "destructive",
			});
		}
	}, [job, videoName, toast]);

	const handleReset = useCallback(() => {
		setStep("upload");
		setVideoPath(null);
		setVideoName("");
		setPreview(null);
		setJob(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	}, []);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
				return;
			}

			if (e.key === "Escape") {
				e.preventDefault();
				if (step === "dubbing" && job?.job_id) {
					apiClient.cancelDub(job.job_id);
					handleReset();
					toast({ title: "Dubbing cancelled" });
				} else if (
					step === "done" ||
					step === "configure" ||
					step === "preview"
				) {
					handleReset();
				}
				return;
			}

			if (e.key === "Enter") {
				e.preventDefault();
				switch (step) {
					case "preview":
						setStep("configure");
						break;
					case "configure":
						if (profileId && videoPath) {
							handleStartDub();
						}
						break;
					case "done":
						handleDownload();
						break;
					default:
						break;
				}
			}
		},
		[
			step,
			profileId,
			videoPath,
			job?.job_id,
			handleDownload,
			handleReset,
			handleStartDub,
			toast,
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	const speakerCount = preview?.detected_speakers?.length ?? 0;

	const shortcutHint: Record<DubStep, string | null> = {
		upload: null,
		preview: "Enter → Continue",
		configure: profileId ? "Enter → Start Dubbing" : null,
		dubbing: "Esc → Cancel",
		done: "Enter → Download · Esc → Reset",
	};

	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

	return (
		<div className="flex flex-col h-full min-h-0 overflow-hidden">
			<div className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
				<Film className="w-5 h-5 text-primary" />
				<h2 className="text-lg font-semibold">Video Dubbing</h2>
				<span className="text-xs text-muted-foreground ml-auto">
					Transcribe ? Translate ? Re-voice ? Export
				</span>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
				{/* Step indicator */}
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					{(
						["upload", "preview", "configure", "dubbing", "done"] as DubStep[]
					).map((s, i) => (
						<span
							key={s}
							className={`px-2 py-1 rounded ${step === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}
						>
							{i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
						</span>
					))}
					{shortcutHint[step] && (
						<span className="ml-auto text-xs text-muted-foreground/60 font-mono">
							{shortcutHint[step]}
						</span>
					)}
				</div>

				{/* Upload */}
				{(step === "upload" || step === "configure") && (
					<div className="space-y-4">
						<div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
							<input
								ref={fileInputRef}
								type="file"
								accept={VIDEO_EXTENSIONS}
								className="hidden"
								onChange={handleFileSelect}
							/>
							<Film className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
							<p className="text-sm text-muted-foreground mb-3">
								{videoName || "Drop a video file or click to browse"}
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => fileInputRef.current?.click()}
							>
								<Upload className="w-4 h-4 mr-2" />
								Choose Video
							</Button>
						</div>

						{videoPath && (
							<div className="text-sm text-muted-foreground">
								Selected:{" "}
								<span className="text-foreground font-medium">{videoName}</span>
							</div>
						)}
					</div>
				)}

				{/* Preview */}
				{step === "preview" && preview && (
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-medium">Transcript Preview</h3>
							<span className="text-xs text-muted-foreground">
								{preview.segments.length} segments · {speakerCount} speaker
								{speakerCount !== 1 ? "s" : ""} detected
							</span>
						</div>
						<div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-3">
							{preview.segments.map((seg) => (
								<div key={seg.id} className="flex gap-2 text-xs">
									<span className="text-muted-foreground w-16 shrink-0 font-mono">
										{seg.start.toFixed(1)}s
									</span>
									<span className="text-primary/70 w-16 shrink-0">
										{seg.speaker}
									</span>
									<span>{seg.text}</span>
								</div>
							))}
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setStep("configure")}
						>
							Continue to Configuration
						</Button>
					</div>
				)}

				{/* Configuration */}
				{(step === "configure" || step === "preview") && (
					<div className="space-y-4">
						<h3 className="text-sm font-medium">Dubbing Settings</h3>

						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label>Target Language</Label>
								<Select value={targetLang} onValueChange={setTargetLang}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{languages &&
											Object.entries(languages).map(([code, name]) => (
												<SelectItem key={code} value={code}>
													{name}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label>Voice Profile</Label>
								<Select value={profileId} onValueChange={setProfileId}>
									<SelectTrigger>
										<SelectValue placeholder="Select voice..." />
									</SelectTrigger>
									<SelectContent>
										{profiles?.map((p: VoiceProfileResponse) => (
											<SelectItem key={p.id} value={p.id}>
												{p.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="space-y-2">
							<Label>TTS Engine</Label>
							<Select value={engine || undefined} onValueChange={setEngine}>
								<SelectTrigger>
									<SelectValue placeholder="Select engine" />
								</SelectTrigger>
								<SelectContent>
									{downloadedDubEngines.map((engine) => (
										<SelectItem key={engine} value={engine}>
											{(TTS_ENGINES as Record<string, string>)[engine] ??
												engine}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>Speakers</Label>
							<Select value={numSpeakers} onValueChange={setNumSpeakers}>
								<SelectTrigger>
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
						</div>

						<div className="flex gap-2">
							<Button
								onClick={handleStartDub}
								disabled={!profileId || dubMutation.isPending}
							>
								<Sparkles className="w-4 h-4 mr-2" />
								{dubMutation.isPending ? "Starting..." : "Start Dubbing"}
							</Button>
							<Button variant="outline" onClick={handleReset}>
								Reset
							</Button>
						</div>
					</div>
				)}

				{/* Dubbing in progress */}
				{step === "dubbing" && job && (
					<div className="space-y-4">
						<h3 className="text-sm font-medium">Dubbing Progress</h3>
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<Badge variant="outline" className="text-xs">
									{job.status}
								</Badge>
								{job.progress !== undefined && (
									<Progress value={job.progress} className="flex-1 h-2" />
								)}
							</div>
							{job.status === "dubbing" && (
								<div className="flex items-center gap-2">
									<Film className="h-4 w-4 text-muted-foreground animate-spin" />
									<span className="text-sm text-muted-foreground">
										Translating ? Re-voicing...
									</span>
								</div>
							)}
							{job.status === "failed" && job.error && (
								<Alert className="text-destructive">{job.error}</Alert>
							)}
						</div>
					</div>
				)}

				{/* Result */}
				{step === "done" && job && (
					<div className="space-y-4">
						<h3 className="text-sm font-medium">Dubbing Complete</h3>
						<div className="rounded-lg border border-border bg-card p-4 space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">
									{videoName || "Dubbed video"}
								</span>
								<span className="text-xs text-muted-foreground">
									{job.duration !== undefined
										? `${(job.duration / 1000).toFixed(1)}s`
										: ""}
								</span>
							</div>
							<Button onClick={handleDownload}>
								<Download className="w-4 h-4 mr-2" />
								Download
							</Button>
							<Button variant="outline" onClick={handleReset}>
								Start Over
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
