import { PauseIcon, PlayIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { AuditionVoice } from "@/features/generate/usePresetAudition";
import { usePresetAudition } from "@/features/generate/usePresetAudition";

export type PreviewButtonState = "idle" | "loading" | "playing";

/**
 * Shared audition play/pause button (picker rows + audition lists).
 * Handles its own click-propagation stop so it nests safely inside
 * selectable rows/cards.
 */
export function PreviewPlayButton({
	state,
	voiceName,
	disabled,
	disabledTitle,
	onPlay,
}: {
	state: PreviewButtonState;
	voiceName: string;
	disabled?: boolean;
	disabledTitle?: string;
	onPlay: () => void;
}) {
	const isLoading = state === "loading";
	const isPlaying = state === "playing";
	return (
		<button
			type="button"
			disabled={disabled || isLoading}
			title={
				disabled && disabledTitle
					? disabledTitle
					: isPlaying
						? `Pause ${voiceName} preview`
						: `Hear ${voiceName}`
			}
			aria-label={
				isPlaying ? `Pause ${voiceName} preview` : `Hear ${voiceName} preview`
			}
			onClick={(e) => {
				e.stopPropagation();
				onPlay();
			}}
			className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground disabled:opacity-40"
		>
			{isLoading ? (
				<span
					className="size-3 animate-spin rounded-full border border-current border-t-transparent"
					aria-hidden="true"
				/>
			) : isPlaying ? (
				<PauseIcon className="size-3" aria-hidden="true" />
			) : (
				<PlayIcon className="size-3" aria-hidden="true" />
			)}
		</button>
	);
}

/**
 * Expandable preset-voice audition list, shared by the Store cards and the
 * voice-design model matrix. Reuses usePresetAudition (synthesized once per
 * voice, then cached) — this component is only UI state + buttons.
 */
export function PresetVoiceAuditionList({
	engine,
	voices,
	downloaded,
}: {
	engine: string;
	voices: AuditionVoice[];
	downloaded: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const { audition, loadingVoiceId, isPreviewPlaying } =
		usePresetAudition(engine);

	if (voices.length === 0) {
		return null;
	}

	return (
		<>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					setExpanded((v) => !v);
				}}
				aria-expanded={expanded}
				className="text-xs text-accent hover:underline"
			>
				{expanded ? "Hide voices" : `Hear ${voices.length} voices`}
			</button>
			{expanded ? (
				downloaded ? (
					<ul className="mt-1.5 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
						{voices.map((v) => {
							const loading = loadingVoiceId === v.id;
							const playing = isPreviewPlaying(v.id);
							const meta = [v.gender, v.language].filter(Boolean).join(" · ");
							return (
								<li
									key={v.id}
									className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs text-muted-foreground"
								>
									<span className="min-w-0 flex-1 truncate font-medium">
										{v.name}
									</span>
									{meta ? (
										<span className="shrink-0 text-[11px] text-muted-foreground/70">
											{meta}
										</span>
									) : null}
									<PreviewPlayButton
										state={loading ? "loading" : playing ? "playing" : "idle"}
										voiceName={v.name}
										onPlay={() => audition(v)}
									/>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="mt-1.5 text-xs text-muted-foreground">
						Download this model to hear its voices.
					</p>
				)
			) : null}
		</>
	);
}
