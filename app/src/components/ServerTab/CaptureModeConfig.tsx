import { CommandLineIcon as Keyboard } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityNotice } from "@/components/AccessibilityGate/AccessibilityGate";
import { ChordPicker } from "@/components/ChordPicker/ChordPicker";
import { InputMonitoringNotice } from "@/components/InputMonitoringGate/InputMonitoringGate";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/use-toast";
import { useDictationReadiness } from "@/lib/hooks/useDictationReadiness";
import { useCaptureSettings } from "@/lib/hooks/useSettings";
import {
	defaultChordKeys,
	displayLabelForKey,
	modifierSideHint,
} from "@/lib/utils/keyCodes";
import { HotkeyPillPreview } from "./HotkeyPillPreview";
import { SettingRow, SettingSection } from "./SettingRow";

function ChordPreview({ keys }: { keys: string[] }) {
	const { t } = useTranslation();
	if (keys.length === 0) {
		return (
			<span className="text-xs text-muted-foreground italic">
				{t("captures.chord.notSet")}
			</span>
		);
	}
	return (
		<div className="flex items-center gap-1">
			{keys.map((k) => {
				const side = modifierSideHint(k);
				return (
					<span
						key={k}
						className="relative inline-flex items-center justify-center h-6 min-w-[1.5rem] px-1.5 rounded-md border border-border bg-muted/60 font-mono text-xs font-medium shadow-sm text-foreground"
					>
						{displayLabelForKey(k)}
						{side ? (
							<span className="absolute -top-1 -right-1 h-3 min-w-[0.75rem] px-0.5 rounded-sm bg-accent text-[7px] font-bold leading-none flex items-center justify-center text-accent-foreground">
								{side}
							</span>
						) : null}
					</span>
				);
			})}
		</div>
	);
}

export function CaptureModeConfig() {
	const { t } = useTranslation();
	const { settings, update } = useCaptureSettings();
	const { toast } = useToast();
	const readiness = useDictationReadiness();

	const hotkeyEnabled = settings?.hotkey_enabled ?? false;
	const pushToTalkKeys =
		settings?.chord_push_to_talk_keys ?? defaultChordKeys("push");
	const toggleToTalkKeys =
		settings?.chord_toggle_to_talk_keys ?? defaultChordKeys("toggle");
	const allowAutoPaste = settings?.allow_auto_paste ?? true;

	const [chordEditor, setChordEditor] = useState<"push" | "toggle" | null>(
		null,
	);

	return (
		<SettingSection
			title={t("settings.captures.dictation.title")}
			description={t("settings.captures.dictation.description")}
		>
			<div>
				<SettingRow
					title={t("settings.captures.dictation.globalShortcut.title")}
					description={t(
						"settings.captures.dictation.globalShortcut.description",
					)}
					htmlFor="hotkeyEnabled"
					action={
						<Toggle
							id="hotkeyEnabled"
							checked={hotkeyEnabled}
							onCheckedChange={(v) => {
								update({ hotkey_enabled: v });
								if (!v) {
									return;
								}
								const missingModels = readiness.missing.filter(
									(g) => g === "stt" || g === "llm",
								);
								if (missingModels.length === 0) {
									return;
								}
								const names = [
									missingModels.includes("stt")
										? readiness.stt?.display_name
										: null,
									missingModels.includes("llm")
										? readiness.llm?.display_name
										: null,
								]
									.filter(Boolean)
									.join(" and ");
								toast({
									title: t("captures.toast.shortcutNotArmed"),
									description: t("captures.toast.shortcutNotArmedDescription", {
										names,
										count: missingModels.length,
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
					<div className="flex items-center gap-2">
						<ChordPreview keys={pushToTalkKeys} />
						<Button
							variant="outline"
							size="sm"
							disabled={!hotkeyEnabled}
							onClick={() => setChordEditor("push")}
						>
							<Keyboard className="h-3.5 w-3.5 mr-1.5" />
							{t("settings.captures.dictation.pushToTalk.change")}
						</Button>
					</div>
				}
			/>

			<SettingRow
				title={t("settings.captures.dictation.toggle.title")}
				description={t("settings.captures.dictation.toggle.description")}
				action={
					<div className="flex items-center gap-2">
						<ChordPreview keys={toggleToTalkKeys} />
						<Button
							variant="outline"
							size="sm"
							disabled={!hotkeyEnabled}
							onClick={() => setChordEditor("toggle")}
						>
							<Keyboard className="h-3.5 w-3.5 mr-1.5" />
							{t("settings.captures.dictation.toggle.change")}
						</Button>
					</div>
				}
			/>

			<ChordPicker
				open={chordEditor === "push"}
				title={t("settings.captures.dictation.chordPicker.pttTitle")}
				description={t(
					"settings.captures.dictation.chordPicker.pttDescription",
				)}
				initialKeys={pushToTalkKeys}
				onCancel={() => setChordEditor(null)}
				onSave={(keys) => {
					update({ chord_push_to_talk_keys: keys });
					setChordEditor(null);
				}}
			/>

			<ChordPicker
				open={chordEditor === "toggle"}
				title={t("settings.captures.dictation.chordPicker.toggleTitle")}
				description={t(
					"settings.captures.dictation.chordPicker.toggleDescription",
				)}
				initialKeys={toggleToTalkKeys}
				onCancel={() => setChordEditor(null)}
				onSave={(keys) => {
					update({ chord_toggle_to_talk_keys: keys });
					setChordEditor(null);
				}}
			/>

			<SettingRow
				title={t("settings.captures.dictation.preview.title")}
				description={t("settings.captures.dictation.preview.description")}
			>
				<HotkeyPillPreview enabled={hotkeyEnabled} />
			</SettingRow>

			<div>
				<SettingRow
					title={t("settings.captures.dictation.autoPaste.title")}
					description={t("settings.captures.dictation.autoPaste.description")}
					htmlFor="autoPaste"
					action={
						<Toggle
							id="autoPaste"
							checked={allowAutoPaste}
							onCheckedChange={(v) => update({ allow_auto_paste: v })}
							disabled={!hotkeyEnabled}
						/>
					}
				/>
				<AccessibilityNotice />
			</div>
		</SettingSection>
	);
}
