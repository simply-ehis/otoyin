import {
	InformationCircleIcon as Info,
	MicrophoneIcon as Mic,
	SparklesIcon as Sparkles,
	CloudArrowUpIcon as Upload,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PRESET_ENGINES } from "@/lib/constants/engines";
import { inferStudioError } from "@/lib/errors";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { useUIStore } from "@/stores/uiStore";
import { ProfileCard } from "./ProfileCard";
import { ProfileForm } from "./ProfileForm";
import { QuickCloneDialog } from "./QuickCloneDialog";

export function ProfileList() {
	const { t } = useTranslation();
	const { data: profiles, isLoading, error } = useProfiles();
	const setDialogOpen = useUIStore((state) => state.setProfileDialogOpen);
	const [quickCloneOpen, setQuickCloneOpen] = useState(false);
	const selectedEngine = useUIStore((state) => state.selectedEngine);
	const selectedProfileId = useUIStore((state) => state.selectedProfileId);
	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	// Scroll to the selected profile after engine/sort changes
	useEffect(() => {
		if (!selectedProfileId) {
			return;
		}
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const rafId = requestAnimationFrame(() => {
			const el = cardRefs.current.get(selectedProfileId);
			if (!el) {
				return;
			}

			// Temporarily apply scroll-margin so it doesn't land flush at the top
			el.style.scrollMarginTop = "180px";
			el.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
				inline: "nearest",
			});
			timeoutId = setTimeout(() => {
				el.style.scrollMarginTop = "";
			}, 500);
		});
		return () => {
			cancelAnimationFrame(rafId);
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [selectedProfileId]);

	if (isLoading) {
		return (
			<div className="flex gap-4 overflow-x-auto p-1 pb-1 lg:grid lg:grid-cols-3 lg:auto-rows-auto lg:overflow-x-visible">
				{Array.from({ length: 6 }, (_, i) => i).map((i) => (
					<div
						key={`skeleton-${i}`}
						className="shrink-0 w-[200px] lg:w-auto lg:shrink"
					>
						<div className="rounded-md border border-border bg-card p-4 space-y-3">
							<Skeleton className="h-20 w-full rounded-md" />
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-3 w-1/2" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (error) {
		const studioErr = inferStudioError(error);
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-destructive text-center space-y-1">
					<p className="font-medium">{studioErr.title}</p>
					<p className="text-sm text-muted-foreground">{studioErr.message}</p>
				</div>
			</div>
		);
	}

	const allProfiles = profiles || [];
	const isPresetEngine = PRESET_ENGINES.has(selectedEngine);

	/** Whether a profile is supported by the currently selected engine. */
	const isSupported = (p: (typeof allProfiles)[number]) =>
		isPresetEngine
			? p.voice_type === "preset" && p.preset_engine === selectedEngine
			: p.voice_type !== "preset";

	// Sort so supported profiles come first
	const sortedProfiles = [...allProfiles].sort(
		(a, b) => (isSupported(a) ? 0 : 1) - (isSupported(b) ? 0 : 1),
	);

	const hasUnsupported = sortedProfiles.some((p) => !isSupported(p));

	return (
		<div className="flex flex-col">
			<div className="shrink-0">
				{allProfiles.length === 0 ? (
					<Card>
						<CardContent className="flex flex-col items-center justify-center py-12">
							<Mic className="size-12 text-muted-foreground mb-4" />
							<p className="text-muted-foreground mb-4">
								{t("profiles.list.empty")}
							</p>
							<div className="flex gap-2">
								<Button
									onClick={() => setQuickCloneOpen(true)}
									variant="outline"
									size="sm"
								>
									<Upload className="mr-2 size-3.5" />
									{t("profiles.list.quickClone", "Quick Clone")}
								</Button>
								<Button onClick={() => setDialogOpen(true)} size="sm">
									<Sparkles className="mr-2 size-3.5" />
									{t("profiles.list.createVoice")}
								</Button>
							</div>
						</CardContent>
					</Card>
				) : (
					<div className="flex gap-4 overflow-x-auto p-1 pb-1 lg:grid lg:grid-cols-3 lg:auto-rows-auto lg:overflow-x-visible lg:pb-[150px]">
						{/* Quick Clone card */}
						<div className="shrink-0 w-[200px] lg:w-auto lg:shrink">
							<button
								type="button"
								onClick={() => setQuickCloneOpen(true)}
								className="w-full flex flex-col items-center justify-center gap-2 p-4 rounded-md border-2 border-dashed border-muted-foreground/20 hover:border-accent/50 hover:bg-accent/5 transition-colors cursor-pointer min-h-[160px]"
							>
								<Upload className="size-8 text-muted-foreground/40" />
								<span className="text-xs font-medium text-muted-foreground">
									{t("profiles.list.quickClone", "Quick Clone")}
								</span>
							</button>
						</div>
						{sortedProfiles.map((profile) => (
							<div
								key={profile.id}
								className="shrink-0 w-[200px] lg:w-auto lg:shrink"
								ref={(el) => {
									if (el) {
										cardRefs.current.set(profile.id, el);
									} else {
										cardRefs.current.delete(profile.id);
									}
								}}
							>
								<ProfileCard
									profile={profile}
									disabled={!isSupported(profile)}
								/>
							</div>
						))}
						{hasUnsupported && (
							<div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground py-2">
								<Info className="h-3.5 w-3.5 shrink-0" />
								<span>{t("profiles.list.unsupportedNote")}</span>
							</div>
						)}
					</div>
				)}
			</div>

			<ProfileForm />
			<QuickCloneDialog
				open={quickCloneOpen}
				onOpenChange={setQuickCloneOpen}
				onComplete={() => {
					setQuickCloneOpen(false);
				}}
			/>
		</div>
	);
}
