import { useTranslation } from "react-i18next";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import type { PlannerModelSize } from "@/lib/api/types";
import { useCaptureSettings } from "@/lib/hooks/useSettings";
import { SettingRow, SettingSection } from "./SettingRow";

export function RefinementSettings() {
	const { t } = useTranslation();
	const { settings, update } = useCaptureSettings();

	const autoRefine = settings?.auto_refine ?? true;
	const llmModel = settings?.llm_model ?? "2B-Q4_K_M";
	const smartCleanup = settings?.smart_cleanup ?? true;
	const selfCorrection = settings?.self_correction ?? true;
	const preserveTechnical = settings?.preserve_technical ?? true;

	return (
		<SettingSection
			title={t("settings.captures.refinement.title")}
			description={t("settings.captures.refinement.description")}
		>
			<SettingRow
				title={t("settings.captures.refinement.auto.title")}
				description={t("settings.captures.refinement.auto.description")}
				htmlFor="autoRefine"
				action={
					<Toggle
						id="autoRefine"
						checked={autoRefine}
						onCheckedChange={(v) => update({ auto_refine: v })}
					/>
				}
			/>

			<SettingRow
				title={t("settings.captures.refinement.model.title")}
				description={t("settings.captures.refinement.model.description")}
				action={
					<Select
						value={llmModel}
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
									tail: t(
										"settings.captures.refinement.model.tail.fullQuality",
									),
								})}
							</SelectItem>
							<SelectItem value="3B-Reasoning-Q4_K_M">
								{t("settings.captures.refinement.model.size3b", {
									tail: t(
										"settings.captures.refinement.model.tail.fullQuality",
									),
								})}
							</SelectItem>
						</SelectContent>
					</Select>
				}
			/>

			<SettingRow
				title={t("settings.captures.refinement.smartCleanup.title")}
				description={t("settings.captures.refinement.smartCleanup.description")}
				htmlFor="smartCleanup"
				action={
					<Toggle
						id="smartCleanup"
						checked={smartCleanup}
						onCheckedChange={(v) => update({ smart_cleanup: v })}
						disabled={!autoRefine}
					/>
				}
			/>

			<SettingRow
				title={t("settings.captures.refinement.selfCorrection.title")}
				description={t(
					"settings.captures.refinement.selfCorrection.description",
				)}
				htmlFor="selfCorrection"
				action={
					<Toggle
						id="selfCorrection"
						checked={selfCorrection}
						onCheckedChange={(v) => update({ self_correction: v })}
						disabled={!autoRefine}
					/>
				}
			/>

			<SettingRow
				title={t("settings.captures.refinement.preserveTechnical.title")}
				description={t(
					"settings.captures.refinement.preserveTechnical.description",
				)}
				htmlFor="preserveTechnical"
				action={
					<Toggle
						id="preserveTechnical"
						checked={preserveTechnical}
						onCheckedChange={(v) => update({ preserve_technical: v })}
						disabled={!autoRefine}
					/>
				}
			/>
		</SettingSection>
	);
}
