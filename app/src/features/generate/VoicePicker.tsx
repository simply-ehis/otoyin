import {
	ChevronDownIcon,
	ChevronUpIcon,
	MicrophoneIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VoiceProfileResponse } from "@/lib/api/types";
import { PRESET_ENGINES } from "@/lib/constants/engines";
import { inferStudioError } from "@/lib/errors";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/primitives";
import { EmptyState } from "@/ui/states";
import { VOICE_TYPE_LABELS } from "./engines";

/**
 * Voice picker: compact card showing the selected voice with a
 * slide-out scrollable list.  The full grid is hidden by default
 * to save vertical space for the composer.
 */
export function VoicePicker() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { data: profiles, isLoading, error } = useProfiles();
	const engine = useUIStore((s) => s.selectedEngine);
	const selectedId = useUIStore((s) => s.selectedProfileId);
	const setSelectedId = useUIStore((s) => s.setSelectedProfileId);
	const [open, setOpen] = useState(false);

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
			<div className="rounded-md border border-border bg-card p-3">
				<div className="flex items-center gap-2">
					<div className="size-8 animate-pulse rounded-sm bg-secondary" />
					<div className="h-4 flex-1 animate-pulse rounded-sm bg-secondary" />
				</div>
			</div>
		);
	}

	if (error) {
		const studioErr = inferStudioError(error);
		return (
			<div className="flex items-center justify-center p-4 text-center">
				<div>
					<p className="font-medium text-destructive">{studioErr.title}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{studioErr.message}
					</p>
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
	const selected = all.find((p) => p.id === selectedId);

	if (all.length === 0) {
		return (
			<EmptyState
				icon={<MicrophoneIcon aria-hidden="true" />}
				title={t("profiles.list.empty")}
				body="Clone a voice from a short sample, or start from a preset."
				action={
					<span className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => navigate({ to: "/voices" })}
						>
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
		<div className="rounded-md border border-border bg-card">
			{/* Compact header — always visible */}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-secondary/50"
				aria-expanded={open}
				aria-label="Toggle voice list"
			>
				<span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-secondary text-xs font-medium text-muted-foreground">
					{selected ? selected.name.charAt(0).toUpperCase() : "?"}
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-medium text-foreground">
						{selected?.name ?? "No voice selected"}
					</span>
					{selected ? (
						<span className="text-xs text-muted-foreground">
							{selected.language}
							{selected.generation_count > 0
								? ` · ${selected.generation_count} gen`
								: ""}
						</span>
					) : null}
				</span>
				{selected ? (
					<Badge
						tone={selected.voice_type === "preset" ? "neutral" : "accent"}
						className="shrink-0"
					>
						{VOICE_TYPE_LABELS[selected.voice_type ?? ""] ??
							selected.voice_type}
					</Badge>
				) : null}
				{open ? (
					<ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" />
				) : (
					<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
				)}
			</button>

			{/* Expandable voice grid */}
			{open ? (
				<div className="max-h-64 overflow-y-auto border-t border-border p-2">
					<div className="grid grid-cols-2 gap-2 md:grid-cols-3">
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
									onClick={() => {
										setSelectedId(p.id);
										setOpen(false);
									}}
									className={cn(
										"flex min-h-[72px] flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										"disabled:cursor-not-allowed disabled:opacity-40",
										active
											? "border-accent bg-secondary"
											: "border-border bg-card hover:border-strong",
									)}
								>
									<span className="flex w-full items-center gap-1.5">
										<span className="truncate text-xs font-medium text-foreground">
											{p.name}
										</span>
										<Badge
											tone={p.voice_type === "preset" ? "neutral" : "accent"}
											className="ml-auto shrink-0"
										>
											{VOICE_TYPE_LABELS[p.voice_type ?? ""] ?? p.voice_type}
										</Badge>
									</span>
									<span className="text-[11px] tabular-nums text-muted-foreground">
										{p.language}
										{p.generation_count > 0
											? ` · ${p.generation_count} gen`
											: ""}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			) : null}
		</div>
	);
}
