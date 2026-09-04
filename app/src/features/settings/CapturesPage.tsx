import {
	CheckIcon,
	ChevronDownIcon,
	CommandLineIcon,
	FolderOpenIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/controls";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { useToast } from "@/ui/use-toast";
import type { VoiceProfileResponse, WhisperModelSize, PlannerModelSize } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { useDictationReadiness } from "@/lib/hooks/useDictationReadiness";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { useCaptureSettings } from "@/lib/hooks/useSettings";
import { debug } from "@/lib/utils/debug";
import { defaultChordKeys, displayLabelForKey, modifierSideHint } from "@/lib/utils/keyCodes";
import { usePlatform } from "@/platform/PlatformContext";
import { useServerStore } from "@/stores/serverStore";
import { AccessibilityNotice, InputMonitoringNotice } from "@/features/capture/gates";
import { ChordPicker } from "@/features/capture/ChordPicker";
import { CapturePill, type PillState } from "@/features/capture/CapturePill";
import { SettingRow, SettingSection } from "./rows";

/**
 * Capture settings: dictation hotkeys, transcription models, refinement,
 * playback voice, storage. Toggles persist optimistically via useSettings.
 */
export function CapturesPage() {
	return (
		<div className="flex max-w-5xl items-start gap-8">
			<div className="min-w-0 max-w-3xl flex-1">
				<CaptureModeConfig />
				<StreamingSettings />
				<RefinementSettings />
				<PlaybackStorageSettings />
			</div>
			<CapturesAbout />
		</div>
	);
}

function ChordPreview({ keys }: { keys: string[] }) {
	const { t } = useTranslation();
	if (keys.length === 0) {
		return (
			<span className="text-xs italic text-muted-foreground">
				{t("captures.chord.notSet")}
			</span>
		);
	}
	return (
		<span className="flex items-center gap-1">
			{keys.map((k) => {
				const side = modifierSideHint(k);
				return (
					<span
						key={k}
						className="relative inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-secondary px-1.5 font-mono text-xs font-medium text-foreground shadow-sm"
					>
						{displayLabelForKey(k)}
						{side ? (
							<span className="absolute -right-1 -top-1 flex h-3 min-w-[0.75rem] items-center justify-center rounded-sm bg-accent px-0.5 text-[7px] font-bold leading-none text-white">
								{side}
							</span>
						) : null}
					</span>
				);
			})}
		</span>
	);
}

function CaptureModeConfig() {
	const { t } = useTranslation();
	const { settings, update } = useCaptureSettings();
	const { toast } = useToast();
	const readiness = useDictationReadiness();

	const hotkeyEnabled = settings?.hotkey_enabled ?? false;
	const pushKeys = settings?.chord_push_to_talk_keys ?? defaultChordKeys("push");
	const toggleKeys = settings?.chord_toggle_to_talk_keys ?? defaultChordKeys("toggle");
	const [editor, setEditor] = useState<"push" | "toggle" | null>(null);

	return (
		<SettingSection
			title={t("settings.captures.dictation.title")}
			description={t("settings.captures.dictation.description")}
		>
			<div>
				<SettingRow
					title={t("settings.captures.dictation.globalShortcut.title")}
					description={t("settings.captures.dictation.globalShortcut.description")}
					action={
						<Switch
							checked={hotkeyEnabled}
							label={t("settings.captures.dictation.globalShortcut.title")}
							onCheckedChange={(v) => {
								update({ hotkey_enabled: v });
								if (!v) {
									return;
								}
								const missing = readiness.missing.filter(
									(g) => g === "stt" || g === "llm",
								);
								if (missing.length === 0) {
									return;
								}
								const names = [
									missing.includes("stt") ? readiness.stt?.display_name : null,
									missing.includes("llm") ? readiness.llm?.display_name : null,
								]
									.filter(Boolean)
									.join(" and ");
								toast({
									title: t("captures.toast.shortcutNotArmed"),
									description: t("captures.toast.shortcutNotArmedDescription", {
										names,
										count: missing.length,
									}),
								});
							}}
						/>
					}
				/>
				<InputMonitoringNotice enabled={hotkeyEnabled} />
			</div>

			<SettingRow
				title={t("settings.captures.dictation.pushToTalk.title")}
				description={t("settings.captures.dictation.pushToTalk.description")}
				action={
					<span className="flex items-center gap-2">
						<ChordPreview keys={pushKeys} />
						<Button
							variant="outline"
							size="sm"
							disabled={!hotkeyEnabled}
							onClick={() => setEditor("push")}
						>
							<CommandLineIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
							{t("settings.captures.dictation.pushToTalk.change")}
						</Button>
					</span>
				}
			/>

			<SettingRow
				title={t("settings.captures.dictation.toggle.title")}
				description={t("settings.captures.dictation.toggle.description")}
				action={
					<span className="flex items-center gap-2">
						<ChordPreview keys={toggleKeys} />
						<Button
							variant="outline"
							size="sm"
							disabled={!hotkeyEnabled}
							onClick={() => setEditor("toggle")}
						>
							<CommandLineIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
							{t("settings.captures.dictation.toggle.change")}
						</Button>
					</span>
				}
			/>

			<ChordPicker
				open={editor === "push"}
				title={t("settings.captures.dictation.chordPicker.pttTitle")}
				description={t("settings.captures.dictation.chordPicker.pttDescription")}
				initialKeys={pushKeys}
				onCancel={() => setEditor(null)}
				onSave={(keys) => {
					update({ chord_push_to_talk_keys: keys });
					setEditor(null);
				}}
			/>
			<ChordPicker
				open={editor === "toggle"}
				title={t("settings.captures.dictation.chordPicker.toggleTitle")}
				description={t("settings.captures.dictation.chordPicker.toggleDescription")}
				initialKeys={toggleKeys}
				onCancel={() => setEditor(null)}
				onSave={(keys) => {
					update({ chord_toggle_to_talk_keys: keys });
					setEditor(null);
				}}
			/>

			<SettingRow
				title={t("settings.captures.dictation.preview.title")}
				description={t("settings.captures.dictation.preview.description")}
			>
				<PillPreview enabled={hotkeyEnabled} />
			</SettingRow>

			<div>
				<SettingRow
					title={t("settings.captures.dictation.autoPaste.title")}
					description={t("settings.captures.dictation.autoPaste.description")}
					action={
						<Switch
							checked={settings?.allow_auto_paste ?? true}
							label={t("settings.captures.dictation.autoPaste.title")}
							onCheckedChange={(v) => update({ allow_auto_paste: v })}
						/>
					}
				/>
				<AccessibilityNotice />
			</div>
		</SettingSection>
	);
}

/** Live pill-state cycler showing what the dictate pill looks like. */
const PREVIEW_STATES: PillState[] = ["recording", "transcribing", "refining", "rest"];
const PREVIEW_MS: Partial<Record<PillState, number>> = {
	recording: 2600,
	transcribing: 1500,
	refining: 1500,
	rest: 900,
};

function PillPreview({ enabled }: { enabled: boolean }) {
	const [state, setState] = useState<PillState>("recording");
	const [tick, setTick] = useState(0);

	useEffect(() => {
		const id = window.setTimeout(() => {
			setState(
				PREVIEW_STATES[(PREVIEW_STATES.indexOf(state) + 1) % PREVIEW_STATES.length] ?? "rest",
			);
		}, PREVIEW_MS[state] ?? 1000);
		return () => window.clearTimeout(id);
	}, [state]);

	useEffect(() => {
		if (state !== "recording") {
			return;
		}
		setTick(0);
		const id = window.setInterval(() => setTick((n) => n + 1), 90);
		return () => window.clearInterval(id);
	}, [state]);

	return (
		<div
			className={
				"relative aspect-[6/1] overflow-hidden rounded-md border transition-opacity " +
				(enabled ? "border-border" : "border-border opacity-50")
			}
			style={{
				backgroundImage:
					"linear-gradient(to right, hsl(30 12% 92% / 0.05) 1px, transparent 1px)," +
					"linear-gradient(to bottom, hsl(30 12% 92% / 0.05) 1px, transparent 1px)",
				backgroundSize: "22px 22px",
			}}
		>
			<div className="absolute inset-0 flex items-center justify-center">
				<CapturePill state={state} elapsedMs={tick * 90} />
			</div>
		</div>
	);
}

function StreamingSettings() {
	const { t } = useTranslation();
	const { settings, update } = useCaptureSettings();
	const langs = ["auto", "en", "es", "fr", "de", "ja", "zh", "hi"] as const;

	return (
		<>
			<SettingSection
				title={t("settings.captures.transcription.title")}
				description={t("settings.captures.transcription.description")}
			>
				<SettingRow
					title={t("settings.captures.transcription.model.title")}
					description={t("settings.captures.transcription.model.description")}
					action={
						<Select
							value={settings?.stt_model ?? "tiny.en"}
							onValueChange={(v) => update({ stt_model: v as WhisperModelSize })}
						>
							<SelectTrigger className="w-full max-w-[300px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="tiny.en">
									{t("settings.captures.transcription.model.tinyEn", {
										tail: t("settings.captures.transcription.model.tail.fast"),
									})}
								</SelectItem>
								<SelectItem value="base.en">
									{t("settings.captures.transcription.model.baseEn", {
										tail: t("settings.captures.transcription.model.tail.balanced"),
									})}
								</SelectItem>
								<SelectItem value="cloud">Cloud (BYOK)</SelectItem>
							</SelectContent>
						</Select>
					}
				/>
				<SettingRow
					title={t("settings.captures.transcription.language.title")}
					description={t("settings.captures.transcription.language.description")}
					action={
						<Select
							value={settings?.language ?? "auto"}
							onValueChange={(v) => update({ language: v })}
						>
							<SelectTrigger className="w-full max-w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{langs.map((l) => (
									<SelectItem key={l} value={l}>
										{t(`settings.captures.transcription.language.${l}` as never)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					}
				/>
				<SettingRow
					title={t("settings.captures.transcription.streamingModel.title")}
					description={t("settings.captures.transcription.streamingModel.description")}
					action={
						<Select
							value={settings?.streaming_stt_model ?? "tiny.en"}
							onValueChange={(v) => update({ streaming_stt_model: v as WhisperModelSize })}
						>
							<SelectTrigger className="w-full max-w-[300px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="tiny.en">
									{t("settings.captures.transcription.streamingModel.tinyEn", {
										tail: t("settings.captures.transcription.model.tail.fast"),
									})}
								</SelectItem>
								<SelectItem value="base.en">
									{t("settings.captures.transcription.streamingModel.baseEn", {
										tail: t("settings.captures.transcription.model.tail.balanced"),
									})}
								</SelectItem>
							</SelectContent>
						</Select>
					}
				/>
				<SettingRow
					title={t("settings.captures.transcription.streamingLanguage.title")}
					description={t("settings.captures.transcription.streamingLanguage.description")}
					action={
						<Select
							value={settings?.streaming_stt_language ?? "auto"}
							onValueChange={(v) => update({ streaming_stt_language: v })}
						>
							<SelectTrigger className="w-full max-w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{langs.map((l) => (
									<SelectItem key={l} value={l}>
										{t(`settings.captures.transcription.streamingLanguage.${l}` as never)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					}
				/>
			</SettingSection>

			<SettingSection
				title={t("settings.captures.transcription.streamingVad.title")}
				description={t("settings.captures.transcription.streamingVad.description")}
			>
				<SettingRow
					title={t("settings.captures.transcription.streamingVad.threshold.title")}
					description={t("settings.captures.transcription.streamingVad.threshold.description")}
					action={
						<Select
							value={(settings?.streaming_vad_threshold ?? 0.02).toFixed(2)}
							onValueChange={(v) => update({ streaming_vad_threshold: parseFloat(v) })}
						>
							<SelectTrigger className="w-full max-w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="0.01">
									{t("settings.captures.transcription.streamingVad.threshold.verySensitive")}
								</SelectItem>
								<SelectItem value="0.02">
									{t("settings.captures.transcription.streamingVad.threshold.default")}
								</SelectItem>
								<SelectItem value="0.05">
									{t("settings.captures.transcription.streamingVad.threshold.lessSensitive")}
								</SelectItem>
								<SelectItem value="0.10">
									{t("settings.captures.transcription.streamingVad.threshold.veryInsensitive")}
								</SelectItem>
							</SelectContent>
						</Select>
					}
				/>
			</SettingSection>
		</>
	);
}

function RefinementSettings() {
	const { t } = useTranslation();
	const { settings, update } = useCaptureSettings();
	const autoRefine = settings?.auto_refine ?? true;

	return (
		<SettingSection
			title={t("settings.captures.refinement.title")}
			description={t("settings.captures.refinement.description")}
		>
			<SettingRow
				title={t("settings.captures.refinement.auto.title")}
				description={t("settings.captures.refinement.auto.description")}
				action={
					<Switch
						checked={autoRefine}
						label={t("settings.captures.refinement.auto.title")}
						onCheckedChange={(v) => update({ auto_refine: v })}
					/>
				}
			/>
			<SettingRow
				title={t("settings.captures.refinement.model.title")}
				description={t("settings.captures.refinement.model.description")}
				action={
					<Select
						value={settings?.llm_model ?? "2B-Q4_K_M"}
						onValueChange={(v) => update({ llm_model: v as PlannerModelSize })}
						disabled={!autoRefine}
					>
						<SelectTrigger className="w-full max-w-[260px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="0.8B-Q5_K_M">
								{t("settings.captures.refinement.model.size08", {
									tail: t("settings.captures.refinement.model.tail.veryFast"),
								})}
							</SelectItem>
							<SelectItem value="2B-Q4_K_M">
								{t("settings.captures.refinement.model.size2b", {
									tail: t("settings.captures.refinement.model.tail.fast"),
								})}
							</SelectItem>
							<SelectItem value="4B-v3-Q4_K_M">
								{t("settings.captures.refinement.model.size4b", {
									tail: t("settings.captures.refinement.model.tail.fullQuality"),
								})}
							</SelectItem>
							<SelectItem value="3B-Reasoning-Q4_K_M">
								{t("settings.captures.refinement.model.size3b", {
									tail: t("settings.captures.refinement.model.tail.fullQuality"),
								})}
							</SelectItem>
						</SelectContent>
					</Select>
				}
			/>
			<SettingRow
				title={t("settings.captures.refinement.smartCleanup.title")}
				description={t("settings.captures.refinement.smartCleanup.description")}
				action={
					<Switch
						checked={settings?.smart_cleanup ?? true}
						label={t("settings.captures.refinement.smartCleanup.title")}
						onCheckedChange={(v) => update({ smart_cleanup: v })}
					/>
				}
			/>
			<SettingRow
				title={t("settings.captures.refinement.selfCorrection.title")}
				description={t("settings.captures.refinement.selfCorrection.description")}
				action={
					<Switch
						checked={settings?.self_correction ?? true}
						label={t("settings.captures.refinement.selfCorrection.title")}
						onCheckedChange={(v) => update({ self_correction: v })}
					/>
				}
			/>
			<SettingRow
				title={t("settings.captures.refinement.preserveTechnical.title")}
				description={t("settings.captures.refinement.preserveTechnical.description")}
				action={
					<Switch
						checked={settings?.preserve_technical ?? true}
						label={t("settings.captures.refinement.preserveTechnical.title")}
						onCheckedChange={(v) => update({ preserve_technical: v })}
					/>
				}
			/>
		</SettingSection>
	);
}

function PlaybackStorageSettings() {
	const { t } = useTranslation();
	const platform = usePlatform();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const { settings, update } = useCaptureSettings();
	const { data: profiles } = useProfiles();

	const defaultVoiceId = settings?.default_playback_voice_id ?? null;
	const voices: VoiceProfileResponse[] = profiles ?? [];
	const current = voices.find((v) => v.id === defaultVoiceId) ?? null;
	const [opening, setOpening] = useState(false);
	const [capturesPath, setCapturesPath] = useState<string | null>(null);

	useEffect(() => {
		fetch(`${serverUrl}/health/filesystem`)
			.then((res) => res.json())
			.then((data) => {
				const dir = data.directories?.find((d: { path: string }) =>
					d.path.includes("captures"),
				);
				if (dir?.path) {
					setCapturesPath(dir.path);
				}
			})
			.catch((err: unknown) => {
				debug.warn("[server] get captures path failed:", err);
			});
	}, [serverUrl]);

	const openFolder = useCallback(async () => {
		if (!capturesPath) {
			return;
		}
		setOpening(true);
		try {
			await platform.filesystem.openPath(capturesPath);
		} catch (e: unknown) {
			showStudioErrorToast(e);
		} finally {
			setOpening(false);
		}
	}, [platform, capturesPath]);

	return (
		<>
			<SettingSection
				title={t("settings.captures.playback.title")}
				description={t("settings.captures.playback.description")}
			>
				<SettingRow
					title={t("settings.captures.playback.defaultVoice.title")}
					description={t("settings.captures.playback.defaultVoice.description")}
					action={
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="min-w-[220px] justify-between gap-2"
									disabled={voices.length === 0}
								>
									<span className="min-w-0 truncate">
										{current ? (
											current.name
										) : (
											<span className="text-muted-foreground">
												{voices.length === 0
													? t("settings.captures.playback.defaultVoice.noClonedVoices")
													: t("settings.captures.playback.defaultVoice.noneSelected")}
											</span>
										)}
									</span>
									<ChevronDownIcon className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-64">
								<DropdownMenuLabel>
									{t("settings.captures.playback.defaultVoice.clonedVoices")}
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{voices.map((v) => (
									<DropdownMenuItem
										key={v.id}
										onClick={() => update({ default_playback_voice_id: v.id })}
										className="gap-3 py-2"
									>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium">{v.name}</span>
											{v.description ? (
												<span className="block truncate text-xs text-muted-foreground">
													{v.description}
												</span>
											) : null}
										</span>
										{v.id === defaultVoiceId ? (
											<CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
										) : null}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					}
				/>
			</SettingSection>

			<SettingSection
				title={t("settings.captures.storage.title")}
				description={t("settings.captures.storage.description")}
			>
				<SettingRow
					title={t("settings.captures.storage.folder.title")}
					description={capturesPath ?? t("settings.captures.storage.folder.description")}
					action={
						<Button
							variant="outline"
							size="sm"
							onClick={openFolder}
							disabled={opening || !capturesPath}
						>
							<FolderOpenIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
							{t("settings.captures.storage.folder.open")}
						</Button>
					}
				/>
			</SettingSection>
		</>
	);
}

function CapturesAbout() {
	const { t } = useTranslation();
	return (
		<aside className="sticky top-0 hidden w-[280px] shrink-0 flex-col gap-6 lg:flex" aria-label="About captures">
			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold text-foreground">
					{t("settings.captures.sidebar.aboutTitle")}
				</h3>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("settings.captures.sidebar.aboutBody")}
				</p>
			</div>
		</aside>
	);
}
