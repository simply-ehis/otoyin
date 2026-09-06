import {
	SparklesIcon as Sparkles,
	StopIcon as Square,
} from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api/client";
import { useGenerationStore } from "@/stores/generationStore";

interface GenerateButtonProps {
	isPending: boolean;
	selectedProfileId: string | null;
}

export function GenerateButton({
	isPending,
	selectedProfileId,
}: GenerateButtonProps) {
	const { t } = useTranslation();
	const pendingIds = useGenerationStore((s) => s.pendingGenerationIds);
	const removePendingGeneration = useGenerationStore(
		(s) => s.removePendingGeneration,
	);

	const cancelMutation = useMutation({
		mutationFn: (id: string) => apiClient.cancelGeneration(id),
		onSuccess: (_data, id) => {
			removePendingGeneration(id);
		},
	});

	// The most recent pending generation is the one to cancel
	const latestPendingId = isPending ? ([...pendingIds].at(-1) ?? null) : null;
	const isCancelling =
		latestPendingId !== null &&
		cancelMutation.isPending &&
		cancelMutation.variables === latestPendingId;

	if (isPending && latestPendingId) {
		return (
			<div className="group relative">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-10 rounded-full bg-destructive hover:brightness-110 text-destructive-foreground transition-[filter] duration-200"
					aria-label="Cancel generation"
					title="Cancel generation"
					disabled={isCancelling}
					onClick={() => cancelMutation.mutate(latestPendingId)}
				>
					{isCancelling ? <Spinner size="md" /> : <Square className="size-5" />}
				</Button>
				<span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground border border-border opacity-0 transition-opacity group-hover:opacity-100 z-[9999]">
					{isCancelling ? "Cancelling…" : "Cancel generation"}
				</span>
			</div>
		);
	}

	return (
		<div className="group relative">
			<Button
				type="submit"
				disabled={isPending || !selectedProfileId}
				className="size-10 rounded-full bg-accent hover:bg-accent/90 hover:scale-105 text-accent-foreground shadow-lg hover:shadow-accent/50 transition-colors transition-transform transition-shadow duration-200"
				size="icon"
				aria-label={
					isPending
						? t("generation.button.generating")
						: !selectedProfileId
							? t("generation.button.selectFirst")
							: t("generation.button.generate")
				}
				title={
					isPending
						? t("generation.button.generating")
						: !selectedProfileId
							? t("generation.button.selectFirst")
							: t("generation.button.generate")
				}
			>
				{isPending ? <Spinner size="md" /> : <Sparkles className="size-5" />}
			</Button>
			<span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground border border-border opacity-0 transition-opacity group-hover:opacity-100 z-[9999]">
				{isPending
					? t("generation.button.generating")
					: !selectedProfileId
						? t("generation.button.selectFirst")
						: t("generation.button.generate")}
			</span>
		</div>
	);
}
