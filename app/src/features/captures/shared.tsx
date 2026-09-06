import {
	EllipsisHorizontalCircleIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { CaptureSource } from "@/lib/api/types";
import { displayLabelForKey, modifierSideHint } from "@/lib/utils/keyCodes";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Badge } from "@/ui/primitives";

/** Capture age in m:ss. */
export function formatDurationMs(ms?: number | null): string {
	if (!ms || ms < 0) {
		return "0:00";
	}
	const total = Math.round(ms / 1000);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Source badge: dictation / recording / file. */
export function SourceBadge({ source }: { source: CaptureSource }) {
	const { t } = useTranslation();
	const Icon =
		source === "dictation"
			? MicrophoneIcon
			: source === "recording"
				? EllipsisHorizontalCircleIcon
				: MusicalNoteIcon;
	const label =
		source === "dictation"
			? t("captures.source.dictation")
			: source === "recording"
				? t("captures.source.recording")
				: t("captures.source.file");
	return (
		<Badge tone="neutral">
			<Icon className="h-2.5 w-2.5" aria-hidden="true" />
			{label}
		</Badge>
	);
}

/** Rendered hotkey chord (key caps + modifier side markers). */
export function ChordKeys({ keys }: { keys: string[] }) {
	if (keys.length === 0) {
		return null;
	}
	return (
		<span className="flex items-center gap-1">
			{keys.map((k) => {
				const side = modifierSideHint(k);
				return (
					<kbd
						key={k}
						className="relative inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-secondary px-1.5 font-mono text-xs font-medium text-foreground shadow-sm"
					>
						{displayLabelForKey(k)}
						{side ? (
							<span className="absolute -right-1 -top-1 flex h-3 min-w-[0.75rem] items-center justify-center rounded-sm bg-accent px-0.5 text-[7px] font-bold leading-none text-white">
								{side}
							</span>
						) : null}
					</kbd>
				);
			})}
		</span>
	);
}

/** Confirm capture deletion (destructive, non-default). */
export function DeleteCaptureDialog({
	open,
	onOpenChange,
	onConfirm,
	deleting,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	deleting: boolean;
}) {
	const { t } = useTranslation();
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogTitle>{t("captures.deleteDialog.title")}</AlertDialogTitle>
				<AlertDialogDescription>
					{t("captures.deleteDialog.description")}
				</AlertDialogDescription>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} disabled={deleting}>
						{deleting
							? t("captures.deleteDialog.deleting")
							: t("common.delete")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
