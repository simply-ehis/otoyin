import { useTranslation } from "react-i18next";
import { FormItem } from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type {
	EffectPresetResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";

interface EffectsPresetSelectProps {
	selectedProfile?: VoiceProfileResponse;
	selectedPresetId: string | null;
	setSelectedPresetId: (id: string | null) => void;
	effectPresets?: EffectPresetResponse[];
}

export function EffectsPresetSelect({
	selectedProfile,
	selectedPresetId,
	setSelectedPresetId,
	effectPresets,
}: EffectsPresetSelectProps) {
	const { t } = useTranslation();

	return (
		<FormItem className="flex-1 space-y-0">
			<Select
				value={selectedPresetId || "none"}
				onValueChange={(value) =>
					setSelectedPresetId(value === "none" ? null : value)
				}
			>
				<SelectTrigger className="h-8 text-xs bg-card border-border rounded-full hover:bg-accent transition-colors">
					<SelectValue placeholder={t("generation.effects.none")} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none" className="text-xs">
						{t("generation.effects.none")}
					</SelectItem>
					{selectedProfile?.effects_chain &&
						selectedProfile.effects_chain.length > 0 && (
							<SelectItem value="_profile" className="text-xs">
								{t("generation.effects.profileDefault")}
							</SelectItem>
						)}
					{effectPresets?.map((preset) => (
						<SelectItem key={preset.id} value={preset.id} className="text-xs">
							{preset.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</FormItem>
	);
}
