/**
 * Songwriter Studio, ported from Resonant (© 2026 Calesthio, AGPL-3.0-only).
 * Shell: draft state, persistence, header, views. Analysis engine in ./packs
 * (ported verbatim); brief/lyrics/coach views in sibling components.
 * UI rewritten on otoyin primitives.
 */
import { BookOpenIcon, MusicalNoteIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { playPreviewBlob } from "@/features/workspace/playBlob";
import { apiClient } from "@/lib/api/client";
import type { SongwritingDraftBody } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ScreenHeader } from "@/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { useToast } from "@/ui/use-toast";
import {
	analyzeSongwriting,
	applyStructureTemplate,
	buildSongwritingPrompt,
	emptySongwritingDraft,
	prepareLyricsForGenerator,
} from "./packs/core";
import { listSongwritingLanguages } from "./packs/registry";
import type { SongwritingDraft } from "./packs/types";
import { SongwriterBrief, type UpdateDraft } from "./SongwriterBrief";
import { type AceStepMode, SongwriterLyrics } from "./SongwriterLyrics";
import {
	useCreateSongDraft,
	useDeleteSongDraft,
	useSongDraft,
	useSongDrafts,
	useUpdateSongDraft,
} from "./useSongDrafts";

const PACKS = listSongwritingLanguages();

function toBody(draft: SongwritingDraft): SongwritingDraftBody {
	return { ...draft };
}

export function SongwriterTab() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const [draftId, setDraftId] = useState<string | null>(null);
	const [draft, setDraft] = useState<SongwritingDraft>(() =>
		emptySongwritingDraft(),
	);
	const [dirty, setDirty] = useState(false);
	const [aceStepMode, setAceStepMode] = useState<AceStepMode>("generate");
	const lyricsRef = useRef<HTMLTextAreaElement>(null);

	const { data: drafts } = useSongDrafts();
	const { data: loaded } = useSongDraft(draftId);
	const createDraft = useCreateSongDraft();
	const updateDraft = useUpdateSongDraft();
	const deleteDraft = useDeleteSongDraft();

	useEffect(() => {
		if (loaded) {
			const body = loaded.draft;
			const pointOfView = (
				["first-person", "second-person", "third-person", "collective"] as const
			).includes(body.pointOfView as SongwritingDraft["pointOfView"])
				? (body.pointOfView as SongwritingDraft["pointOfView"])
				: "first-person";
			const tense = (["past", "present", "future", "mixed"] as const).includes(
				body.tense as SongwritingDraft["tense"],
			)
				? (body.tense as SongwritingDraft["tense"])
				: "present";
			setDraft({ ...body, pointOfView, tense });
			setDirty(false);
		}
	}, [loaded]);

	const pack =
		PACKS.find((candidate) => candidate.id === draft.language) ?? PACKS[0];
	const quickSections = pack?.quickSections ?? [
		"Verse",
		"Pre-Chorus",
		"Chorus",
		"Bridge",
		"Outro",
	];
	const analysis = useMemo(() => analyzeSongwriting(draft), [draft]);

	const update: UpdateDraft = (key, value) => {
		setDraft((current) => ({ ...current, [key]: value }));
		setDirty(true);
	};

	const save = () => {
		const body = {
			title: draft.title,
			language: draft.language,
			draft: toBody(draft),
		};
		if (draftId) {
			updateDraft.mutate(
				{ draftId, data: body },
				{
					onSuccess: () => {
						setDirty(false);
						toast({
							title: t("songwriter.toast.saved", {
								defaultValue: "Draft saved",
							}),
						});
					},
					onError: (e: unknown) => showStudioErrorToast(e),
				},
			);
		} else {
			createDraft.mutate(body, {
				onSuccess: (created) => {
					setDraftId(created.id);
					setDirty(false);
					toast({
						title: t("songwriter.toast.saved", { defaultValue: "Draft saved" }),
					});
				},
				onError: (e: unknown) => showStudioErrorToast(e),
			});
		}
	};

	const copyBrief = async () => {
		try {
			await navigator.clipboard.writeText(buildSongwritingPrompt(draft));
			toast({
				title: t("songwriter.toast.briefCopied", {
					defaultValue: "Writing brief copied",
				}),
			});
		} catch {
			toast({
				title: t("songwriter.toast.copyFailed", {
					defaultValue: "Could not copy the brief",
				}),
				variant: "destructive",
			});
		}
	};

	const insertSection = (sectionLabel: string) => {
		const textarea = lyricsRef.current;
		const start = textarea?.selectionStart ?? draft.lyrics.length;
		const prefix =
			start && !draft.lyrics.slice(0, start).endsWith("\n\n") ? "\n\n" : "";
		const addition = `${prefix}[${sectionLabel}]\n`;
		update(
			"lyrics",
			`${draft.lyrics.slice(0, start)}${addition}${draft.lyrics.slice(start)}`,
		);
		requestAnimationFrame(() => {
			textarea?.focus();
			textarea?.setSelectionRange(
				start + addition.length,
				start + addition.length,
			);
		});
	};

	const sendToGenerator = useMutation({
		mutationFn: () => {
			const lyrics = prepareLyricsForGenerator(draft.lyrics, draft.language);
			const prompt = [
				draft.stylePrompt,
				draft.hook ? `Hook: ${draft.hook}` : "",
				lyrics.trim(),
			]
				.filter(Boolean)
				.join("\n\n");
			return apiClient.generateMusic({
				engine: "acestep_gguf",
				prompt,
				duration_seconds: 60,
				genre: draft.genre || "pop",
				mood: draft.mood || "neutral",
				mode: aceStepMode,
			});
		},
		onSuccess: (blob) => {
			playPreviewBlob(blob);
			toast({
				title: t("songwriter.toast.rendered", {
					defaultValue: "ACE-Step render playing",
				}),
			});
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const canSend = draft.lyrics.trim().length > 0 && !sendToGenerator.isPending;

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title={t("songwriter.title", { defaultValue: "Songwriter" })}
				helpPath="/songwriter"
				actions={
					<div className="flex items-center gap-2">
						<Select
							value={draftId ?? "_new"}
							onValueChange={(value) => {
								if (value === "_new") {
									setDraftId(null);
									setDraft(emptySongwritingDraft());
									setDirty(false);
								} else {
									setDraftId(value);
								}
							}}
						>
							<SelectTrigger
								className="h-8 w-44 text-xs"
								aria-label={t("songwriter.draft", { defaultValue: "Draft" })}
							>
								<SelectValue
									placeholder={t("songwriter.newDraft", {
										defaultValue: "New draft",
									})}
								/>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="_new">
									{t("songwriter.newDraft", { defaultValue: "New draft" })}
								</SelectItem>
								{(drafts ?? []).map((d) => (
									<SelectItem key={d.id} value={d.id}>
										{d.title ||
											t("songwriter.untitled", { defaultValue: "Untitled" })}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={
								!dirty || createDraft.isPending || updateDraft.isPending
							}
							title={t("songwriter.save", { defaultValue: "Save draft" })}
							aria-label={t("songwriter.save", { defaultValue: "Save draft" })}
							onClick={save}
						>
							{t("songwriter.save", { defaultValue: "Save" })}
							{dirty ? " ·" : ""}
						</Button>
						{draftId ? (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={deleteDraft.isPending}
								title={t("songwriter.delete", { defaultValue: "Delete draft" })}
								aria-label={t("songwriter.delete", {
									defaultValue: "Delete draft",
								})}
								onClick={() =>
									deleteDraft.mutate(draftId, {
										onSuccess: () => {
											setDraftId(null);
											setDraft(emptySongwritingDraft());
											setDirty(false);
										},
										onError: (e: unknown) => showStudioErrorToast(e),
									})
								}
							>
								{t("common.delete", { defaultValue: "Delete" })}
							</Button>
						) : null}
					</div>
				}
			/>
			<Tabs defaultValue="brief">
				<TabsList
					aria-label={t("songwriter.views", {
						defaultValue: "Songwriter views",
					})}
				>
					<TabsTrigger value="brief">
						<BookOpenIcon className="size-4" aria-hidden="true" />
						{t("songwriter.songDna", { defaultValue: "Song DNA" })}
					</TabsTrigger>
					<TabsTrigger value="lyrics">
						<MusicalNoteIcon className="size-4" aria-hidden="true" />
						{t("songwriter.lyricsCraft", { defaultValue: "Lyrics & Craft" })}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="brief">
					<SongwriterBrief
						draft={draft}
						update={update}
						pack={pack}
						packs={PACKS}
						onApplyTemplate={(templateId) => {
							setDraft((current) =>
								applyStructureTemplate(current, templateId),
							);
							setDirty(true);
						}}
					/>
				</TabsContent>
				<TabsContent value="lyrics">
					<SongwriterLyrics
						draft={draft}
						update={update}
						analysis={analysis}
						lyricPlaceholder={
							pack?.lyricPlaceholder ??
							"[Verse 1]\nPut the listener inside a specific moment…"
						}
						quickSections={quickSections}
						lyricsRef={lyricsRef}
						packDescription={pack?.description}
						onInsertSection={insertSection}
						onCopyBrief={() => void copyBrief()}
						onSend={() => sendToGenerator.mutate()}
						canSend={canSend}
						sending={sendToGenerator.isPending}
						aceStepMode={aceStepMode}
						onAceStepModeChange={setAceStepMode}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
