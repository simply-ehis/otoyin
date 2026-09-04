import { MicrophoneIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/ui/primitives";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { PRESET_ENGINES } from "@/lib/constants/engines";
import type { VoiceProfileResponse } from "@/lib/api/types";
import { inferStudioError } from "@/lib/errors";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";
import { VOICE_TYPE_LABELS } from "./engines";

/**
 * Voice grid: supported-first sort for the active engine, skeleton /
 * error / empty states, selection commits to the shared store.
 * Creation flows live on the Voices tab for now (navigated to).
 */
export function VoicePicker() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { data: profiles, isLoading, error } = useProfiles();
	const engine = useUIStore((s) => s.selectedEngine);
	const selectedId = useUIStore((s) => s.selectedProfileId);
	const setSelectedId = useUIStore((s) => s.setSelectedProfileId);

	useEffect(() => {
		if (!selectedId || !profiles?.some((p) => p.id === selectedId)) {
			return;
		}
		document
			.getElementById(`voice-${selectedId}`)
			?.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}, [selectedId, profiles]);

	if (isLoading) {
		return (
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Loading voices">
				{Array.from({ length: 6 }, (_, i) => (
					<div key={i} className="rounded-md border border-border bg-card p-4">
						<div aria-hidden="true" className="h-16 w-full animate-pulse rounded-sm bg-secondary" />
						<div aria-hidden="true" className="mt-3 h-4 w-3/4 animate-pulse rounded-sm bg-secondary" />
					</div>
				))}
			</div>
		);
	}

	if (error) {
		const studioErr = inferStudioError(error);
		return (
			<div className="flex items-center justify-center p-8 text-center">
				<div>
					<p className="font-medium text-destructive">{studioErr.title}</p>
					<p className="mt-1 text-sm text-muted-foreground">{studioErr.message}</p>
				</div>
			</div>
		);
	}

	const all = profiles ?? [];
	const presetEngine = PRESET_ENGINES.has(engine);
	const supported = (p: VoiceProfileResponse) =>
		presetEngine
			? p.voice_type === "preset" && p.preset_engine === engine
			: p.voice_type !== "preset";
	const sorted = [...all].sort(
		(a, b) => (supported(a) ? 0 : 1) - (supported(b) ? 0 : 1),
	);

	if (all.length === 0) {
		return (
			<EmptyState
				icon={<MicrophoneIcon aria-hidden="true" />}
				title={t("profiles.list.empty")}
				body="Clone a voice from a short sample, or start from a preset."
				action={
					<span className="flex gap-2">
						<Button variant="outline" size="sm" onClick={() => navigate({ to: "/voices" })}>
							Quick clone
						</Button>
						<Button size="sm" onClick={() => navigate({ to: "/voices" })}>
							{t("profiles.list.createVoice")}
						</Button>
					</span>
				}
			/>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
			{sorted.map((p) => {
				const active = p.id === selectedId;
				const ok = supported(p);
				return (
					<button
						key={p.id}
						id={`voice-${p.id}`}
						type="button"
						aria-pressed={active}
						disabled={!ok}
						onClick={() => setSelectedId(p.id)}
						className={cn(
							"flex min-h-[96px] flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:cursor-not-allowed disabled:opacity-40",
							active
								? "border-accent bg-secondary"
								: "border-border bg-card hover:border-strong",
						)}
					>
						<span className="flex w-full items-center gap-1.5">
							<span className="truncate text-sm font-medium text-foreground">{p.name}</span>
							<Badge tone={p.voice_type === "preset" ? "neutral" : "accent"} className="ml-auto shrink-0">
								{VOICE_TYPE_LABELS[p.voice_type ?? ""] ?? p.voice_type}
							</Badge>
						</span>
						<span className="text-xs tabular-nums text-muted-foreground">
							{p.language}
							{p.generation_count > 0 ? ` · ${p.generation_count} gen` : ""}
						</span>
					</button>
				);
			})}
		</div>
	);
}
