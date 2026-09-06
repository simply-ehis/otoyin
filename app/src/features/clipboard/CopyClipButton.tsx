import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type Clip, copyClip } from "@/lib/clip";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/use-toast";

/**
 * Header-level "copy the current item" button. Takes the tab's current clip
 * (selection, latest render, open item) and lands it on the server clipboard
 * so any other tab can paste it. Disabled + tooltiped when there is nothing
 * to copy yet.
 */
export function CopyClipButton({
	clip,
	label,
	title,
	onCopied,
}: {
	/** The clip to copy, or null when the tab has nothing copyable. */
	clip: Clip | null;
	label?: string;
	title?: string;
	onCopied?: () => void;
}) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const [pending, setPending] = useState(false);
	const resolvedLabel =
		label ?? t("history.actions.copyClip", { defaultValue: "Copy as clip" });

	async function handleCopy() {
		if (!clip || pending) {
			return;
		}
		setPending(true);
		try {
			await copyClip(clip);
			toast({
				title: t("history.actions.copyClipDone", {
					defaultValue: "Copied to clipboard — paste into any tab",
				}),
			});
			onCopied?.();
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setPending(false);
		}
	}

	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			disabled={!clip || pending}
			title={
				title ??
				(clip
					? `${resolvedLabel}: ${clip.name}`
					: t("clipboard.nothingToCopy", {
							defaultValue: "Nothing to copy yet",
						}))
			}
			aria-label={title ?? resolvedLabel}
			onClick={() => void handleCopy()}
		>
			<ClipboardDocumentIcon className="size-4" aria-hidden="true" />
			{pending
				? t("common.copying", { defaultValue: "Copying…" })
				: resolvedLabel}
		</Button>
	);
}
