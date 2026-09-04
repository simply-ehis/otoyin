import {
	CheckIcon as Check,
	ChevronDownIcon as ChevronDown,
	FolderOpenIcon as FolderOpen,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { VoiceProfileResponse } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { useCaptureSettings } from "@/lib/hooks/useSettings";
import { usePlatform } from "@/platform/PlatformContext";
import { useServerStore } from "@/stores/serverStore";
import { debug } from "../../lib/utils/debug";
import { SettingRow, SettingSection } from "./SettingRow";

export function PlaybackStorageSettings() {
	const { t } = useTranslation();
	const platform = usePlatform();
	const serverUrl = useServerStore((state) => state.serverUrl);
	const { settings, update } = useCaptureSettings();
	const { data: profiles } = useProfiles();

	const defaultVoiceId = settings?.default_playback_voice_id ?? null;
	const voices: VoiceProfileResponse[] = profiles ?? [];
	const defaultVoice = voices.find((v) => v.id === defaultVoiceId) ?? null;

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
			.catch((err) => {
				debug.warn("[server] get captures path failed:", err);
			});
	}, [serverUrl]);

	const openCapturesFolder = useCallback(async () => {
		if (!capturesPath) {
			return;
		}
		setOpening(true);
		try {
			await platform.filesystem.openPath(capturesPath);
		} catch (e) {
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
									className="gap-2 min-w-[220px] justify-between"
									disabled={voices.length === 0}
								>
									<div className="flex items-center gap-2 min-w-0">
										{defaultVoice ? (
											<span className="truncate">{defaultVoice.name}</span>
										) : (
											<span className="truncate text-muted-foreground">
												{voices.length === 0
													? t(
															"settings.captures.playback.defaultVoice.noClonedVoices",
														)
													: t(
															"settings.captures.playback.defaultVoice.noneSelected",
														)}
											</span>
										)}
									</div>
									<ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-64">
								<DropdownMenuLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
									{t("settings.captures.playback.defaultVoice.clonedVoices")}
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{voices.map((v) => (
									<DropdownMenuItem
										key={v.id}
										onClick={() => update({ default_playback_voice_id: v.id })}
										className="gap-3 py-2"
									>
										<div className="flex-1 min-w-0">
											<div className="text-sm font-medium truncate">
												{v.name}
											</div>
											{v.description ? (
												<div className="text-xs text-muted-foreground truncate">
													{v.description}
												</div>
											) : null}
										</div>
										{v.id === defaultVoiceId && (
											<Check className="h-3.5 w-3.5 text-accent shrink-0" />
										)}
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
					description={
						capturesPath ?? t("settings.captures.storage.folder.description")
					}
					action={
						<Button
							variant="outline"
							size="sm"
							onClick={openCapturesFolder}
							disabled={opening || !capturesPath}
						>
							<FolderOpen className="h-3.5 w-3.5 mr-1.5" />
							{t("settings.captures.storage.folder.open")}
						</Button>
					}
				/>
			</SettingSection>
		</>
	);
}
