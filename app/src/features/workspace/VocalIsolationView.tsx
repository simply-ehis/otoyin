/**
 * Stem Separation — Demucs audio source isolation.
 * Single-stem mode (pick one) and multi-stem mode (all 4 at once).
 * Drag-drop upload, source waveform preview, per-stem player/volume/download.
 */
import {
	ArrowDownTrayIcon,
	MusicalNoteIcon,
	PlayIcon,
	StopIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPeakWaveform } from "@/features/audioStudio/getPeakWaveform";
import { apiClient } from "@/lib/api/client";
import { DEMUCS_MODEL_NAME } from "@/lib/audio/ensureModel";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Label, Separator, Spinner } from "@/ui/primitives";
import { ScreenHeader } from "@/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { useToast } from "@/ui/use-toast";

export const ISOLATION_STEMS = [
	{
		value: "vocals",
		label: "Vocals",
		color: "#ff6b86",
		desc: "Singing and speech",
	},
	{
		value: "drums",
		label: "Drums",
		color: "#58d6c7",
		desc: "Kick, snare, hi-hats, percussion",
	},
	{
		value: "bass",
		label: "Bass",
		color: "#9b8cff",
		desc: "Bass guitar, synth bass, sub",
	},
	{
		value: "other",
		label: "Other",
		color: "#ffb454",
		desc: "Piano, guitars, synths, FX",
	},
] as const;

export type IsolationStem = (typeof ISOLATION_STEMS)[number]["value"];

interface StemResult {
	stem: IsolationStem;
	url: string;
	blob: Blob;
	volume: number;
	muted: boolean;
}

function WaveformBars({ peaks }: { peaks: Float32Array }) {
	return (
		<div className="flex h-10 items-end gap-px" aria-hidden="true">
			{Array.from(peaks, (v, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: static waveform bars, never reorder
					key={i}
					className="flex-1 rounded-t-sm bg-primary/40"
					style={{ height: `${Math.max(4, v * 100)}%` }}
				/>
			))}
		</div>
	);
}

export function VocalIsolationView() {
	const { toast } = useToast();
	const [audioPath, setAudioPath] = useState("");
	const [fileName, setFileName] = useState("");
	const [uploading, setUploading] = useState(false);
	const [stem, setStem] = useState<IsolationStem>("vocals");
	const [results, setResults] = useState<StemResult[]>([]);
	const [multiProgress, setMultiProgress] = useState(0);
	const [sourcePeaks, setSourcePeaks] = useState<Float32Array | null>(null);
	const [sourceUrl, setSourceUrl] = useState<string | null>(null);
	const [sourcePlaying, setSourcePlaying] = useState(false);
	const sourceAudioRef = useRef<HTMLAudioElement>(null);
	const [dragOver, setDragOver] = useState(false);

	const modelStatus = useQuery({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		refetchInterval: (query) =>
			query.state.data?.models.find((m) => m.model_name === DEMUCS_MODEL_NAME)
				?.downloading
				? 2500
				: false,
	});

	const demucs = modelStatus.data?.models.find(
		(m) => m.model_name === DEMUCS_MODEL_NAME,
	);
	const modelReady = !!demucs?.downloaded;

	useEffect(() => {
		return () => {
			for (const r of results) {
				URL.revokeObjectURL(r.url);
			}
			if (sourceUrl) {
				URL.revokeObjectURL(sourceUrl);
			}
		};
	}, [results, sourceUrl]);

	const handleFile = useCallback(
		async (file: File) => {
			setUploading(true);
			setSourcePeaks(null);
			setSourceUrl(null);
			setResults([]);
			try {
				const { audio_path } = await apiClient.dspUpload(file, file.name);
				setAudioPath(audio_path);
				setFileName(file.name);

				try {
					const arrayBuf = await file.arrayBuffer();
					const ctx = new AudioContext();
					const decoded = await ctx.decodeAudioData(arrayBuf);
					setSourcePeaks(getPeakWaveform(decoded, 120));
					await ctx.close();
				} catch {
					// Waveform is optional
				}

				if (sourceUrl) {
					URL.revokeObjectURL(sourceUrl);
				}
				setSourceUrl(URL.createObjectURL(file));

				toast({ title: `Uploaded: ${file.name}` });
			} catch (error) {
				toast({
					title: "Upload failed",
					description: error instanceof Error ? error.message : String(error),
					variant: "destructive",
				});
			} finally {
				setUploading(false);
			}
		},
		[toast, sourceUrl],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file?.type.startsWith("audio/")) {
				void handleFile(file);
			}
		},
		[handleFile],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	}, []);

	const handleDragLeave = useCallback(() => setDragOver(false), []);

	const singleMut = useMutation({
		mutationFn: () => apiClient.separateAudio(audioPath, stem),
		onSuccess: (blob) => {
			setResults((prev) => {
				const filtered = prev.filter((r) => r.stem !== stem);
				return [
					...filtered,
					{
						stem,
						url: URL.createObjectURL(blob),
						blob,
						volume: 1,
						muted: false,
					},
				];
			});
			toast({ title: `${stem} stem separated` });
		},
		onError: (error: unknown) => showStudioErrorToast(error),
	});

	const multiMut = useMutation({
		mutationFn: async () => {
			setResults([]);
			setMultiProgress(0);
			const stems: IsolationStem[] = ["vocals", "drums", "bass", "other"];
			const newResults: StemResult[] = [];
			for (let i = 0; i < stems.length; i++) {
				const s = stems[i];
				setMultiProgress(i / stems.length);
				const blob = await apiClient.separateAudio(audioPath, s);
				newResults.push({
					stem: s,
					url: URL.createObjectURL(blob),
					blob,
					volume: 1,
					muted: false,
				});
				setResults([...newResults]);
			}
			setMultiProgress(1);
			return newResults;
		},
		onSuccess: () => {
			toast({ title: "All 4 stems separated" });
		},
		onError: (error: unknown) => showStudioErrorToast(error),
		onSettled: () => setMultiProgress(0),
	});

	const updateStemVolume = useCallback(
		(stemId: IsolationStem, volume: number) => {
			setResults((prev) =>
				prev.map((r) => (r.stem === stemId ? { ...r, volume } : r)),
			);
		},
		[],
	);

	const toggleStemMute = useCallback((stemId: IsolationStem) => {
		setResults((prev) =>
			prev.map((r) => (r.stem === stemId ? { ...r, muted: !r.muted } : r)),
		);
	}, []);

	const downloadStem = useCallback(
		(r: StemResult) => {
			const a = document.createElement("a");
			a.href = r.url;
			a.download = `${fileName.replace(/\.[^.]+$/, "") || "audio"}-${r.stem}.wav`;
			a.click();
		},
		[fileName],
	);

	const downloadAll = useCallback(() => {
		for (const r of results) {
			downloadStem(r);
		}
	}, [results, downloadStem]);

	const isPending = singleMut.isPending || multiMut.isPending;
	const stemMeta = useMemo(
		() => Object.fromEntries(ISOLATION_STEMS.map((s) => [s.value, s])),
		[],
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: must be a div for drag-drop events
		<div
			className="flex h-full max-w-2xl flex-col gap-4 overflow-y-auto p-4"
			role="region"
			aria-label="Stem Separation"
			onDrop={handleDrop}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
		>
			<ScreenHeader
				title="Stem Separation"
				description="Split any recording into vocals, drums, bass, and other — powered by Demucs HTDemucs"
			/>

			<Separator />

			{!modelReady && (
				<div className="space-y-1 rounded-md border border-warning bg-warning-soft px-3 py-2 text-xs">
					<p className="font-medium text-warning-text">
						Demucs model not installed yet
					</p>
					<p className="text-warning-text">
						Download it from the Store to use stem separation.{" "}
						<Link
							to="/store"
							className="rounded-sm underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Get it from the Store
						</Link>
					</p>
				</div>
			)}

			{/* Drop zone */}
			<div
				className={`flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
					dragOver
						? "border-primary bg-primary/5"
						: "border-border hover:border-muted-foreground/30"
				}`}
			>
				<MusicalNoteIcon
					className="size-6 text-muted-foreground"
					aria-hidden="true"
				/>
				{uploading ? (
					<div className="flex items-center gap-2 text-xs">
						<Spinner size="xs" />
						Uploading…
					</div>
				) : (
					<>
						<p className="text-xs text-muted-foreground">
							Drop an audio file here or{" "}
							<label
								htmlFor="stem-upload"
								className="cursor-pointer underline transition-colors hover:text-foreground"
							>
								browse
							</label>
						</p>
						<input
							id="stem-upload"
							type="file"
							accept="audio/*"
							className="hidden"
							onChange={(e) => {
								const f = e.target.files?.[0];
								if (f) {
									void handleFile(f);
								}
							}}
						/>
					</>
				)}
				{fileName && !uploading ? (
					<p className="text-xs font-medium text-foreground">{fileName}</p>
				) : null}
			</div>

			{/* Source waveform + player */}
			{sourcePeaks && (
				<div className="space-y-2 rounded-md border border-border bg-card p-3">
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-foreground">Source</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 w-7 p-0"
							title={sourcePlaying ? "Stop" : "Play source"}
							onClick={() => {
								if (!sourceAudioRef.current) {
									return;
								}
								if (sourcePlaying) {
									sourceAudioRef.current.pause();
									setSourcePlaying(false);
								} else {
									sourceAudioRef.current.play();
									setSourcePlaying(true);
								}
							}}
						>
							{sourcePlaying ? (
								<StopIcon className="size-3.5" />
							) : (
								<PlayIcon className="size-3.5" />
							)}
						</Button>
					</div>
					<WaveformBars peaks={sourcePeaks} />
					{/* biome-ignore lint/a11y/useMediaCaption: source audio preview */}
					<audio
						ref={sourceAudioRef}
						src={sourceUrl ?? undefined}
						onEnded={() => setSourcePlaying(false)}
						className="hidden"
					/>
				</div>
			)}

			{/* Separator mode */}
			<Tabs defaultValue="single">
				<TabsList aria-label="Separation mode">
					<TabsTrigger value="single">Single Stem</TabsTrigger>
					<TabsTrigger value="multi">All 4 Stems</TabsTrigger>
				</TabsList>

				<TabsContent value="single" className="space-y-3">
					<div className="grid grid-cols-2 gap-2">
						{ISOLATION_STEMS.map((s) => (
							<button
								key={s.value}
								type="button"
								className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
									stem === s.value
										? "border-primary bg-primary/10 text-foreground"
										: "border-border text-muted-foreground hover:border-muted-foreground/30"
								}`}
								disabled={isPending}
								onClick={() => setStem(s.value)}
							>
								<span
									className="size-2.5 shrink-0 rounded-full"
									style={{ background: s.color }}
								/>
								<div>
									<p className="font-medium">{s.label}</p>
									<p className="text-[10px] text-muted-foreground">{s.desc}</p>
								</div>
							</button>
						))}
					</div>
					<Button
						type="button"
						size="sm"
						disabled={!audioPath || isPending}
						title="Isolate the selected stem"
						aria-label="Isolate stem"
						onClick={() => singleMut.mutate()}
					>
						{singleMut.isPending ? (
							<Spinner size="xs" className="mr-1" />
						) : null}
						{singleMut.isPending ? "Separating…" : "Isolate Stem"}
					</Button>
				</TabsContent>

				<TabsContent value="multi" className="space-y-3">
					<p className="text-xs text-muted-foreground">
						Extract all 4 stems in one pass. Each run takes ~30s on CPU.
					</p>
					{multiMut.isPending && (
						<div className="space-y-1.5">
							<div className="h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									className="h-full bg-primary transition-all duration-300"
									style={{ width: `${multiProgress * 100}%` }}
								/>
							</div>
							<p className="text-[10px] text-muted-foreground">
								Separating stem {results.length + 1} of 4…
							</p>
						</div>
					)}
					<Button
						type="button"
						size="sm"
						disabled={!audioPath || isPending}
						title="Separate all 4 stems"
						aria-label="Separate all stems"
						onClick={() => multiMut.mutate()}
					>
						{multiMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
						{multiMut.isPending
							? `Separating… (${results.length}/4)`
							: "Separate All Stems"}
					</Button>
				</TabsContent>
			</Tabs>

			{/* Results */}
			{results.length > 0 ? (
				<section className="space-y-2">
					<div className="flex items-center justify-between">
						<h2 className="text-xs font-medium text-foreground">
							Results ({results.length} stem
							{results.length > 1 ? "s" : ""})
						</h2>
						{results.length > 1 ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-7 gap-1 text-[10px]"
								onClick={downloadAll}
							>
								<ArrowDownTrayIcon className="size-3" aria-hidden="true" />
								Download All
							</Button>
						) : null}
					</div>
					<div className="space-y-2">
						{results.map((r) => {
							const meta = stemMeta[r.stem];
							return (
								<div
									key={r.stem}
									className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<button
												type="button"
												className={`size-2 rounded-full transition-colors ${
													r.muted ? "bg-muted-foreground/30" : "bg-foreground"
												}`}
												title={r.muted ? "Unmute" : "Mute"}
												onClick={() => toggleStemMute(r.stem)}
											/>
											<span className="text-xs font-medium">
												{meta?.label ?? r.stem}
											</span>
											<span className="text-[10px] text-muted-foreground">
												{meta?.desc}
											</span>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 gap-1 text-[10px]"
											title={`Download ${r.stem} as WAV`}
											onClick={() => downloadStem(r)}
										>
											<ArrowDownTrayIcon
												className="size-3"
												aria-hidden="true"
											/>
											Save
										</Button>
									</div>
									{/* biome-ignore lint/a11y/useMediaCaption: stem preview */}
									<audio
										src={r.url}
										controls
										className="h-8 w-full"
										style={{ opacity: r.muted ? 0.4 : 1 }}
									/>
									<div className="flex items-center gap-2">
										<Label className="w-12 text-[10px] text-muted-foreground">
											Vol
										</Label>
										<input
											type="range"
											min={0}
											max={1.5}
											step={0.05}
											value={r.volume}
											onChange={(e) =>
												updateStemVolume(
													r.stem,
													Number.parseFloat(e.target.value),
												)
											}
											className="h-1 flex-1 accent-primary"
											aria-label={`${meta?.label ?? r.stem} volume`}
										/>
										<span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
											{Math.round(r.volume * 100)}%
										</span>
									</div>
								</div>
							);
						})}
					</div>
				</section>
			) : null}
		</div>
	);
}
