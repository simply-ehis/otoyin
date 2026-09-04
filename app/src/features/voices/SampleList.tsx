import {
	CheckIcon,
	ClipboardDocumentIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	PlusIcon,
	SpeakerWaveIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/ui/dialog";
import { Slider } from "@/ui/slider";
import { Spinner } from "@/ui/primitives";
import { Textarea } from "@/ui/input";
import { useToast } from "@/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { copyClip, resolveAudioDurationMs } from "@/lib/clip";
import {
	useDeleteSample,
	useProfileSamples,
	useUpdateSample,
} from "@/lib/hooks/useProfiles";
import { formatAudioDuration } from "@/lib/utils/audio";
import { cn } from "@/lib/utils/cn";
import { SampleUpload } from "./SampleUpload";

function MiniPlayer({ audioUrl }: { audioUrl: string }) {
	const { t } = useTranslation();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [playing, setPlaying] = useState(false);
	const [position, setPosition] = useState(0);
	const [duration, setDuration] = useState(0);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const audio = new Audio(audioUrl);
		audioRef.current = audio;
		const onMeta = () => {
			setDuration(audio.duration);
			setLoading(false);
		};
		const onTime = () => setPosition(audio.currentTime);
		const onEnd = () => {
			setPlaying(false);
			setPosition(0);
		};
		const onPlay = () => setPlaying(true);
		const onPause = () => setPlaying(false);
		audio.addEventListener("loadedmetadata", onMeta);
		audio.addEventListener("timeupdate", onTime);
		audio.addEventListener("ended", onEnd);
		audio.addEventListener("play", onPlay);
		audio.addEventListener("pause", onPause);
		return () => {
			audio.pause();
			audio.removeEventListener("loadedmetadata", onMeta);
			audio.removeEventListener("timeupdate", onTime);
			audio.removeEventListener("ended", onEnd);
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("pause", onPause);
			audio.src = "";
		};
	}, [audioUrl]);

	return (
		<div className="mt-2 border-t border-border px-3 py-2">
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					disabled={loading}
					onClick={() => {
						if (!audioRef.current) {
							return;
						}
						if (playing) {
							audioRef.current.pause();
						} else {
							void audioRef.current.play();
						}
					}}
					aria-label={playing ? t("sampleList.player.pause") : t("sampleList.player.play")}
				>
					{playing ? (
						<PauseIcon className="h-3.5 w-3.5" aria-hidden="true" />
					) : (
						<PlayIcon className="ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
					)}
				</Button>
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<Slider
						value={duration > 0 ? [(position / duration) * 100] : [0]}
						onValueChange={([v]) => {
							if (audioRef.current && duration > 0 && v !== undefined) {
								audioRef.current.currentTime = (v / 100) * duration;
							}
						}}
						max={100}
						step={0.1}
						aria-label={t("sampleList.player.position")}
						className="flex-1"
					/>
					<span className="flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
						{formatAudioDuration(position)} / {formatAudioDuration(duration)}
					</span>
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					onClick={() => {
						audioRef.current?.pause();
						if (audioRef.current) {
							audioRef.current.currentTime = 0;
						}
						setPlaying(false);
						setPosition(0);
					}}
					title={t("sampleList.player.stop")}
					aria-label={t("sampleList.player.stopAria")}
				>
					<XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}

/**
 * Reference samples for a voice: inline player, transcript edit,
 * clip copy, delete (confirmed), upload dialog.
 */
export function SampleList({ profileId }: { profileId: string }) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const { data: samples, isLoading } = useProfileSamples(profileId);
	const deleteSample = useDeleteSample();
	const updateSample = useUpdateSample();
	const [uploadOpen, setUploadOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [deleteId, setDeleteId] = useState<string | null>(null);

	if (isLoading) {
		return <p className="text-sm text-muted-foreground">{t("sampleList.loading")}</p>;
	}

	return (
		<div className="flex flex-col gap-2 pt-4">
			{samples && samples.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-md border border-dashed border-strong px-4 py-8 text-center">
					<SpeakerWaveIcon className="mb-2 size-8 text-muted-foreground/60" aria-hidden="true" />
					<p className="text-sm text-muted-foreground">{t("sampleList.empty.title")}</p>
					<p className="mt-1 text-xs text-muted-foreground/70">{t("sampleList.empty.hint")}</p>
				</div>
			) : (
				<ul className="flex flex-col gap-2">
					{samples?.map((sample, index) => {
						const editing = editingId === sample.id;
						return (
							<li
								key={sample.id}
								className={cn(
									"relative rounded-md border bg-card transition-colors",
									editing ? "border-accent" : "hover:border-strong",
								)}
							>
								<span
									aria-hidden="true"
									className="absolute right-2 top-1 text-xs font-medium tabular-nums text-muted-foreground/60"
								>
									#{index + 1}
								</span>
								{editing ? (
									<div className="flex flex-col gap-3 p-4">
										<p className="flex items-center gap-2 text-xs text-muted-foreground">
											<PencilIcon className="size-3" aria-hidden="true" />
											{t("sampleList.editing")}
										</p>
										<Textarea
											value={draft}
											onChange={(e) => setDraft(e.target.value)}
											className="min-h-[100px] resize-none text-sm"
											placeholder={t("sampleList.placeholder")}
											autoFocus
										/>
										<div className="flex items-center justify-end gap-2">
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() => {
													setEditingId(null);
													setDraft("");
												}}
												disabled={updateSample.isPending}
											>
												<XMarkIcon className="mr-1 size-4" aria-hidden="true" />
												{t("common.cancel")}
											</Button>
											<Button
												type="button"
												size="sm"
												disabled={updateSample.isPending}
												loading={updateSample.isPending}
												onClick={() => {
													if (!draft.trim()) {
														toast({
															title: t("sampleList.toast.invalidText"),
															description: t("sampleList.toast.invalidTextDescription"),
															variant: "destructive",
														});
														return;
													}
													updateSample.mutate(
														{ sampleId: sample.id, referenceText: draft.trim() },
														{
															onSuccess: () => {
																toast({
																	title: t("sampleList.toast.updated"),
																	description: t("sampleList.toast.updatedDescription"),
																});
																setEditingId(null);
																setDraft("");
															},
															onError: (error: unknown) =>
																toast({
																	title: t("sampleList.toast.updateFailed"),
																	description:
																		error instanceof Error
																			? error.message
																			: t("sampleList.toast.updateFailedFallback"),
																	variant: "destructive",
																}),
														},
													);
												}}
											>
												{updateSample.isPending ? null : (
													<CheckIcon className="mr-1 size-4" aria-hidden="true" />
												)}
												{updateSample.isPending ? t("sampleList.saving") : t("common.save")}
											</Button>
										</div>
									</div>
								) : (
									<>
										<div className="flex items-center gap-3 p-3">
											<p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground line-clamp-2">
												{sample.reference_text}
											</p>
											<span className="flex shrink-0 items-center gap-0.5">
												<button
													type="button"
													title={t("sampleList.editTranscription")}
													aria-label={`${t("sampleList.editTranscription")}: ${sample.reference_text}`}
													onClick={() => {
														setEditingId(sample.id);
														setDraft(sample.reference_text);
													}}
													className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
												>
													<PencilIcon className="size-3.5" aria-hidden="true" />
												</button>
												<button
													type="button"
													title={t("sampleList.copyClip")}
													aria-label={`${t("sampleList.copyClip")}: ${sample.reference_text}`}
													onClick={() => {
														const url = apiClient.getSampleUrl(sample.id);
														resolveAudioDurationMs(url).then(
															(durationMs) =>
																copyClip({
																	kind: "sample",
																	id: sample.id,
																	audioUrl: url,
																	name: sample.reference_text,
																	durationMs,
																}).then(
																	() => toast({ title: t("sampleList.toast.copyClipDone") }),
																	() =>
																		toast({
																			title: t("sampleList.toast.copyClipFailed"),
																			variant: "destructive",
																		}),
																),
															() =>
																toast({
																	title: t("sampleList.toast.copyClipFailed"),
																	variant: "destructive",
																}),
														);
													}}
													className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
												>
													<ClipboardDocumentIcon className="size-3.5" aria-hidden="true" />
												</button>
												<button
													type="button"
													title={t("sampleList.deleteSample")}
													aria-label={`${t("sampleList.deleteSample")}: ${sample.reference_text}`}
													disabled={deleteSample.isPending}
													onClick={() => setDeleteId(sample.id)}
													className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-40"
												>
													<TrashIcon className="size-3.5" aria-hidden="true" />
												</button>
											</span>
										</div>
										<MiniPlayer audioUrl={apiClient.getSampleUrl(sample.id)} />
									</>
								)}
							</li>
						);
					})}
				</ul>
			)}

			<Button type="button" variant="outline" className="w-full" onClick={() => setUploadOpen(true)}>
				<PlusIcon className="mr-2 size-4" aria-hidden="true" />
				{t("sampleList.addSample")}
			</Button>
			<p className="px-2 text-center text-xs text-muted-foreground">{t("sampleList.note")}</p>

			<SampleUpload profileId={profileId} open={uploadOpen} onOpenChange={setUploadOpen} />

			<Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>				<DialogContent>
					<DialogTitle>{t("sampleList.deleteDialog.title")}</DialogTitle>
					<DialogDescription>{t("sampleList.deleteDialog.description")}</DialogDescription>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setDeleteId(null)}>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							disabled={deleteSample.isPending}
							loading={deleteSample.isPending}
							onClick={() => {
								if (deleteId) {
									deleteSample.mutate(deleteId);
									setDeleteId(null);
								}
							}}
						>
							{deleteSample.isPending
								? t("sampleList.deleteDialog.deleting")
								: t("common.delete")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
