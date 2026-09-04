import { useTranslation } from "react-i18next";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { WhisperModelSize } from "@/lib/api/types";
import { useCaptureSettings } from "@/lib/hooks/useSettings";
import { SettingRow, SettingSection } from "./SettingRow";

export function StreamingSettings() {
	const { t } = useTranslation();
	const { settings, update } = useCaptureSettings();

	const sttModel = settings?.stt_model ?? "tiny.en";
	const language = settings?.language ?? "auto";
	const streamingSttModel = settings?.streaming_stt_model ?? "tiny.en";
	const streamingSttLanguage = settings?.streaming_stt_language ?? "auto";
	const streamingVadThreshold = settings?.streaming_vad_threshold ?? 0.02;

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
							value={sttModel}
							onValueChange={(v) =>
								update({ stt_model: v as WhisperModelSize })
							}
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
										tail: t(
											"settings.captures.transcription.model.tail.balanced",
										),
									})}
								</SelectItem>
								<SelectItem value="cloud">Cloud (BYOK)</SelectItem>
							</SelectContent>
						</Select>
					}
				/>
				<SettingRow
					title={t("settings.captures.transcription.language.title")}
					description={t(
						"settings.captures.transcription.language.description",
					)}
					action={
						<Select
							value={language}
							onValueChange={(v) => update({ language: v })}
						>
							<SelectTrigger className="w-full max-w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="auto">
									{t("settings.captures.transcription.language.auto")}
								</SelectItem>
								<SelectItem value="en">
									{t("settings.captures.transcription.language.en")}
								</SelectItem>
								<SelectItem value="es">
									{t("settings.captures.transcription.language.es")}
								</SelectItem>
								<SelectItem value="fr">
									{t("settings.captures.transcription.language.fr")}
								</SelectItem>
								<SelectItem value="de">
									{t("settings.captures.transcription.language.de")}
								</SelectItem>
								<SelectItem value="ja">
									{t("settings.captures.transcription.language.ja")}
								</SelectItem>
								<SelectItem value="zh">
									{t("settings.captures.transcription.language.zh")}
								</SelectItem>
								<SelectItem value="hi">
									{t("settings.captures.transcription.language.hi")}
								</SelectItem>
							</SelectContent>
						</Select>
					}
				/>
				<SettingRow
					title={t("settings.captures.transcription.streamingModel.title")}
					description={t(
						"settings.captures.transcription.streamingModel.description",
					)}
					action={
						<Select
							value={streamingSttModel}
							onValueChange={(v) =>
								update({ streaming_stt_model: v as WhisperModelSize })
							}
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
										tail: t(
											"settings.captures.transcription.model.tail.balanced",
										),
									})}
								</SelectItem>
							</SelectContent>
						</Select>
					}
				/>
				<SettingRow
					title={t("settings.captures.transcription.streamingLanguage.title")}
					description={t(
						"settings.captures.transcription.streamingLanguage.description",
					)}
					action={
						<Select
							value={streamingSttLanguage}
							onValueChange={(v) => update({ streaming_stt_language: v })}
						>
							<SelectTrigger className="w-full max-w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="auto">
									{t("settings.captures.transcription.streamingLanguage.auto")}
								</SelectItem>
								<SelectItem value="en">
									{t("settings.captures.transcription.streamingLanguage.en")}
								</SelectItem>
								<SelectItem value="es">
									{t("settings.captures.transcription.streamingLanguage.es")}
								</SelectItem>
								<SelectItem value="fr">
									{t("settings.captures.transcription.streamingLanguage.fr")}
								</SelectItem>
								<SelectItem value="de">
									{t("settings.captures.transcription.streamingLanguage.de")}
								</SelectItem>
								<SelectItem value="ja">
									{t("settings.captures.transcription.streamingLanguage.ja")}
								</SelectItem>
								<SelectItem value="zh">
									{t("settings.captures.transcription.streamingLanguage.zh")}
								</SelectItem>
								<SelectItem value="hi">
									{t("settings.captures.transcription.streamingLanguage.hi")}
								</SelectItem>
							</SelectContent>
						</Select>
					}
				/>
			</SettingSection>

			<SettingSection
				title={t("settings.captures.transcription.streamingVad.title")}
				description={t(
					"settings.captures.transcription.streamingVad.description",
				)}
			>
				<SettingRow
					title={t(
						"settings.captures.transcription.streamingVad.threshold.title",
					)}
					description={t(
						"settings.captures.transcription.streamingVad.threshold.description",
					)}
					action={
						<Select
							value={streamingVadThreshold.toFixed(2)}
							onValueChange={(v) =>
								update({ streaming_vad_threshold: parseFloat(v) })
							}
						>
							<SelectTrigger className="w-full max-w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="0.01">
									{t(
										"settings.captures.transcription.streamingVad.threshold.verySensitive",
									)}
								</SelectItem>
								<SelectItem value="0.02">
									{t(
										"settings.captures.transcription.streamingVad.threshold.default",
									)}
								</SelectItem>
								<SelectItem value="0.05">
									{t(
										"settings.captures.transcription.streamingVad.threshold.lessSensitive",
									)}
								</SelectItem>
								<SelectItem value="0.10">
									{t(
										"settings.captures.transcription.streamingVad.threshold.veryInsensitive",
									)}
								</SelectItem>
							</SelectContent>
						</Select>
					}
				/>
			</SettingSection>
		</>
	);
}
