import {
	BoltIcon,
	FolderOpenIcon,
	LanguageIcon,
	MicrophoneIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { showStudioErrorToast } from "@/lib/errors";
import { useGenerationSettings } from "@/lib/hooks/useSettings";
import { debug } from "@/lib/utils/debug";
import { usePlatform } from "@/platform/PlatformContext";
import { useServerStore } from "@/stores/serverStore";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/controls";
import { Slider } from "@/ui/slider";
import { SettingRow, SettingSection } from "./rows";

/**
 * Generation defaults: chunking, crossfade, normalization, autoplay,
 * audio tags, preload, generations folder. Sliders persist on release
 * only — never a PATCH per pointer-move pixel.
 */
export function GenerationPage() {
	const { t } = useTranslation();
	const platform = usePlatform();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const { settings, update } = useGenerationSettings();
	const persistedChunk = settings?.max_chunk_chars ?? 800;
	const persistedXfade = settings?.crossfade_ms ?? 50;
	const [maxChunkChars, setMaxChunkChars] = useState(persistedChunk);
	const [crossfadeMs, setCrossfadeMs] = useState(persistedXfade);
	useEffect(() => setMaxChunkChars(persistedChunk), [persistedChunk]);
	useEffect(() => setCrossfadeMs(persistedXfade), [persistedXfade]);
	const [opening, setOpening] = useState(false);
	const [generationsPath, setGenerationsPath] = useState<string | null>(null);

	useEffect(() => {
		fetch(`${serverUrl}/health/filesystem`)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				const genDir = data?.directories?.find((d: { path: string }) =>
					d.path.includes("generations"),
				);
				if (genDir?.path) {
					setGenerationsPath(genDir.path);
				}
			})
			.catch((err: unknown) => {
				debug.warn("[server] get generations path failed:", err);
			});
	}, [serverUrl]);

	const openGenerationsFolder = useCallback(async () => {
		if (!generationsPath) {
			return;
		}
		setOpening(true);
		try {
			await platform.filesystem.openPath(generationsPath);
		} catch (e: unknown) {
			showStudioErrorToast(e);
		} finally {
			setOpening(false);
		}
	}, [platform, generationsPath]);

	return (
		<div className="flex max-w-4xl items-start gap-8">
			<div className="min-w-0 max-w-4xl flex-1">
				<SettingSection
					title={t("settings.generation.title")}
					description={t("settings.generation.description")}
				>
					<SettingRow
						title={t("settings.generation.chunkLimit.title")}
						description={t("settings.generation.chunkLimit.description")}
						action={
							<span className="text-sm tabular-nums text-muted-foreground">
								{t("settings.generation.chunkLimit.value", {
									chars: maxChunkChars,
								})}
							</span>
						}
					>
						<Slider
							value={[maxChunkChars]}
							onValueChange={([v]) => setMaxChunkChars(v ?? maxChunkChars)}
							onValueCommit={([v]) => update({ max_chunk_chars: v })}
							min={100}
							max={5000}
							step={50}
							aria-label={t("settings.generation.chunkLimit.title")}
						/>
					</SettingRow>

					<SettingRow
						title={t("settings.generation.crossfade.title")}
						description={t("settings.generation.crossfade.description")}
						action={
							<span className="text-sm tabular-nums text-muted-foreground">
								{crossfadeMs === 0
									? t("settings.generation.crossfade.cut")
									: t("settings.generation.crossfade.ms", { ms: crossfadeMs })}
							</span>
						}
					>
						<Slider
							value={[crossfadeMs]}
							onValueChange={([v]) => setCrossfadeMs(v ?? crossfadeMs)}
							onValueCommit={([v]) => update({ crossfade_ms: v })}
							min={0}
							max={200}
							step={10}
							aria-label={t("settings.generation.crossfade.title")}
						/>
					</SettingRow>

					<SettingRow
						title={t("settings.generation.normalize.title")}
						description={t("settings.generation.normalize.description")}
						action={
							<Switch
								checked={settings?.normalize_audio ?? true}
								label={t("settings.generation.normalize.title")}
								onCheckedChange={(v) => update({ normalize_audio: v })}
							/>
						}
					/>

					<SettingRow
						title={t("settings.generation.autoplay.title")}
						description={t("settings.generation.autoplay.description")}
						action={
							<Switch
								checked={settings?.autoplay_on_generate ?? true}
								label={t("settings.generation.autoplay.title")}
								onCheckedChange={(v) => update({ autoplay_on_generate: v })}
							/>
						}
					/>

					<SettingRow
						title={t("settings.generation.audioTags.title")}
						description={t("settings.generation.audioTags.description")}
						action={
							<Switch
								checked={settings?.audio_tags_enabled ?? false}
								label={t("settings.generation.audioTags.title")}
								onCheckedChange={(v) => update({ audio_tags_enabled: v })}
							/>
						}
					/>

					<SettingRow
						title={t("settings.generation.preload.title")}
						description={t("settings.generation.preload.description")}
						action={
							<Switch
								checked={settings?.preload_on_start ?? true}
								label={t("settings.generation.preload.title")}
								onCheckedChange={(v) => update({ preload_on_start: v })}
							/>
						}
					/>

					<SettingRow
						title={t("settings.generation.folder.title")}
						description={
							generationsPath ?? t("settings.generation.folder.description")
						}
						action={
							<Button
								variant="outline"
								size="sm"
								onClick={openGenerationsFolder}
								disabled={opening || !generationsPath}
							>
								<FolderOpenIcon
									className="mr-1.5 h-3.5 w-3.5"
									aria-hidden="true"
								/>
								{t("settings.generation.folder.open")}
							</Button>
						}
					/>
				</SettingSection>
			</div>

			<aside
				className="sticky top-0 hidden w-[280px] shrink-0 flex-col gap-6 lg:flex"
				aria-label="About generation"
			>
				<div className="flex flex-col gap-2">
					<h3 className="text-sm font-semibold text-foreground">
						{t("settings.generation.sidebar.aboutTitle")}
					</h3>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("settings.generation.sidebar.aboutBody")}
					</p>
				</div>
				<div className="flex flex-col gap-3">
					<h3 className="text-sm font-semibold text-foreground">
						{t("settings.generation.sidebar.differencesTitle")}
					</h3>
					<ul className="flex flex-col gap-3 text-sm text-muted-foreground">
						<li className="flex gap-3">
							<MicrophoneIcon
								className="mt-0.5 size-4 shrink-0 text-accent"
								aria-hidden="true"
							/>
							<span className="leading-relaxed">
								<span className="font-medium text-foreground">
									{t("settings.generation.sidebar.clone.title")}
								</span>{" "}
								{t("settings.generation.sidebar.clone.body")}
							</span>
						</li>
						<li className="flex gap-3">
							<LanguageIcon
								className="mt-0.5 size-4 shrink-0 text-accent"
								aria-hidden="true"
							/>
							<span className="leading-relaxed">
								<span className="font-medium text-foreground">
									{t("settings.generation.sidebar.engines.title")}
								</span>{" "}
								{t("settings.generation.sidebar.engines.body")}
							</span>
						</li>
						<li className="flex gap-3">
							<BoltIcon
								className="mt-0.5 size-4 shrink-0 text-accent"
								aria-hidden="true"
							/>
							<span className="leading-relaxed">
								<span className="font-medium text-foreground">
									{t("settings.generation.sidebar.agentReady.title")}
								</span>{" "}
								{t("settings.generation.sidebar.agentReady.body")}
							</span>
						</li>
					</ul>
				</div>
			</aside>
		</div>
	);
}
