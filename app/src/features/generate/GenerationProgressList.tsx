import { PauseIcon, PlayIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { formatAudioDuration } from "@/lib/utils/audio";
import {
	type GenerationStage,
	useGenerationProgressStore,
} from "@/stores/generationProgressStore";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useToast } from "@/ui/use-toast";

const STAGE_LABEL: Record<GenerationStage, string> = {
	connecting: "Connecting…",
	loading_model: "Loading model…",
	generating: "Generating…",
	streaming: "Streaming…",
};

/**
 * Live generation progress: one compact row per in-flight generation with
 * stage, elapsed time, chunk fraction, cancel, and "listen now" once the
 * first streamable chunk exists. Renders nothing when idle.
 */
export function GenerationProgressList() {
	const byId = useGenerationProgressStore((s) => s.byId);
	const ids = Object.keys(byId);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (ids.length === 0) {
			return;
		}
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [ids.length]);

	if (ids.length === 0) {
		return null;
	}

	return (
		<output
			className="flex flex-col gap-2 rounded-md border border-border bg-card p-2"
			aria-live="polite"
			aria-label="Generations in progress"
		>
			{ids.map((id) => (
				<ProgressRow key={id} id={id} now={now} />
			))}
		</output>
	);
}

function ProgressRow({ id, now }: { id: string; now: number }) {
	const entry = useGenerationProgressStore((s) => s.byId[id]);
	const { toast } = useToast();
	const [cancelling, setCancelling] = useState(false);
	const playerAudioId = usePlayerStore((s) => s.audioId);
	const playerPlaying = usePlayerStore((s) => s.isPlaying);

	if (!entry) {
		return null;
	}

	const elapsed = Math.max(0, (now - entry.startedAt) / 1000);
	const hasChunks = entry.chunksTotal > 0;
	const determinate = hasChunks && entry.stage === "streaming";
	const barWidth = determinate
		? Math.min(100, (entry.chunksReady / Math.max(1, entry.chunksTotal)) * 100)
		: 33;
	const listening = playerAudioId === id && playerPlaying;

	const cancel = async () => {
		setCancelling(true);
		try {
			await apiClient.cancelGeneration(id);
			useGenerationStore.getState().removePendingGeneration(id);
			useGenerationProgressStore.getState().remove(id);
		} catch (e) {
			showStudioErrorToast(e);
		} finally {
			setCancelling(false);
		}
	};

	const listen = () => {
		if (!entry.previewUrl) {
			return;
		}
		if (listening) {
			usePlayerStore.getState().setIsPlaying(false);
			return;
		}
		// Same id the hook uses: completion swaps this preview for the final mix.
		usePlayerStore
			.getState()
			.setAudioWithAutoPlay(entry.previewUrl, id, "", "");
		toast({
			title: "Playing partial audio",
			description:
				"Live preview — the finished take replaces it automatically.",
		});
	};

	return (
		<div className="flex items-center gap-2">
			<span
				className="size-2 shrink-0 animate-pulse rounded-full bg-accent"
				aria-hidden="true"
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-xs text-foreground">
					{STAGE_LABEL[entry.stage]}{" "}
					{hasChunks ? (
						<span className="tabular-nums text-muted-foreground">
							{entry.chunksReady}/{entry.chunksTotal} chunks
						</span>
					) : null}
					<span className="tabular-nums text-muted-foreground">
						{" "}
						· {formatAudioDuration(elapsed)}
					</span>
				</p>
				<div
					className="mt-1 h-1 overflow-hidden rounded-full bg-secondary"
					role="progressbar"
					aria-label={`Generation progress: ${STAGE_LABEL[entry.stage]}`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(barWidth)}
					aria-valuetext={
						hasChunks
							? `${entry.chunksReady} of ${entry.chunksTotal} chunks`
							: STAGE_LABEL[entry.stage]
					}
				>
					<div
						className={`h-full rounded-full bg-accent ${determinate ? "" : "animate-pulse"}`}
						style={{ width: `${barWidth}%` }}
					/>
				</div>
			</div>
			{entry.previewUrl ? (
				<button
					type="button"
					onClick={listen}
					title={listening ? "Pause preview" : "Listen to what's done so far"}
					aria-label={listening ? "Pause preview" : "Listen to partial audio"}
					className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary"
				>
					{listening ? (
						<PauseIcon className="size-3.5" aria-hidden="true" />
					) : (
						<PlayIcon className="size-3.5" aria-hidden="true" />
					)}
				</button>
			) : null}
			<button
				type="button"
				onClick={() => void cancel()}
				disabled={cancelling}
				title="Cancel generation"
				aria-label="Cancel generation"
				className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
			>
				<XMarkIcon className="size-3.5" aria-hidden="true" />
			</button>
		</div>
	);
}
