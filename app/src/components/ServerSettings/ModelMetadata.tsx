import {
	ArrowDownTrayIcon as Download,
	HeartIcon as Heart,
	MusicalNoteIcon as MusicNote,
	ScaleIcon as Scale,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { HuggingFaceModelInfo } from "@/lib/api/types";
import {
	findSampleAudioUrls,
	formatDownloads,
	formatLicense,
	formatPipelineTag,
} from "./modelUtils";

interface DetailCardInfoProps {
	hfModelInfo?: HuggingFaceModelInfo;
	license?: string;
}

export function DetailCardInfo({ hfModelInfo, license }: DetailCardInfoProps) {
	const { t } = useTranslation();
	if (!hfModelInfo) {
		return null;
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-1">
				{hfModelInfo.pipeline_tag && (
					<Badge variant="outline" className="text-xs h-4 px-1">
						{formatPipelineTag(hfModelInfo.pipeline_tag)}
					</Badge>
				)}
				{hfModelInfo.library_name && (
					<Badge variant="outline" className="text-xs h-4 px-1">
						{hfModelInfo.library_name}
					</Badge>
				)}
				{hfModelInfo.author && (
					<Badge variant="outline" className="text-xs h-4 px-1">
						{t("models.detail.byAuthor", { author: hfModelInfo.author })}
					</Badge>
				)}
			</div>

			<div className="flex items-center gap-3 text-xs text-muted-foreground">
				<span
					className="flex items-center gap-0.5"
					title={t("models.detail.downloads")}
				>
					<Download className="size-3" />
					{formatDownloads(hfModelInfo.downloads)}
				</span>
				<span
					className="flex items-center gap-0.5"
					title={t("models.detail.likes")}
				>
					<Heart className="size-3" />
					{formatDownloads(hfModelInfo.likes)}
				</span>
				{license && (
					<span
						className="flex items-center gap-0.5"
						title={t("models.detail.license")}
					>
						<Scale className="size-3" />
						{formatLicense(license)}
					</span>
				)}
			</div>

			{hfModelInfo.cardData?.language &&
				hfModelInfo.cardData.language.length > 0 && (
					<div>
						<span className="text-xs text-muted-foreground">
							{hfModelInfo.cardData.language.length > 10
								? t("models.detail.languagesCount", {
										count: hfModelInfo.cardData.language.length,
									})
								: t("models.detail.languagesList", {
										list: hfModelInfo.cardData.language.join(", "),
									})}
						</span>
					</div>
				)}
		</div>
	);
}

interface SampleAudioPreviewProps {
	repoId?: string;
	hfModelInfo?: HuggingFaceModelInfo;
}

export function SampleAudioPreview({
	repoId,
	hfModelInfo,
}: SampleAudioPreviewProps) {
	const { t } = useTranslation();
	if (!repoId) {
		return null;
	}
	const urls = findSampleAudioUrls(repoId, hfModelInfo);
	if (urls.length === 0) {
		return null;
	}

	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1 text-xs text-muted-foreground">
				<MusicNote className="size-3" />
				{t("models.detail.samplePreview")}
			</div>
			<div className="space-y-1.5">
				{" "}
				{urls.map((url) => (
					<audio
						key={url}
						controls
						preload="none"
						className="h-8 w-full"
						src={url}
						onError={(e) => {
							(e.target as HTMLAudioElement).style.display = "none";
						}}
					>
						<track kind="captions" />
					</audio>
				))}
			</div>
		</div>
	);
}
