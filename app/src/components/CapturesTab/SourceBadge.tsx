import {
	EllipsisHorizontalCircleIcon as CircleDot,
	MusicalNoteIcon as FileAudio,
	MicrophoneIcon as Mic,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { CaptureSource } from "@/lib/api/types";

export function SourceBadge({ source }: { source: CaptureSource }) {
	const { t } = useTranslation();
	const Icon =
		source === "dictation"
			? Mic
			: source === "recording"
				? CircleDot
				: FileAudio;
	const label =
		source === "dictation"
			? t("captures.source.dictation")
			: source === "recording"
				? t("captures.source.recording")
				: t("captures.source.file");
	return (
		<Badge
			variant="secondary"
			className="h-5 px-1.5 text-xs gap-1 font-medium bg-muted/60 text-muted-foreground"
		>
			<Icon className="h-2.5 w-2.5" />
			{label}
		</Badge>
	);
}
