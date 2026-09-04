import {
	ArrowDownTrayIcon,
	PencilIcon,
	SparklesIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/ui/primitives";
import { Button } from "@/ui/button";
import { Card, CardBody } from "@/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/ui/dialog";
import type { VoiceProfileResponse } from "@/lib/api/types";
import { ENGINE_DISPLAY_NAMES } from "@/lib/constants/engines";
import { useDeleteProfile, useExportProfile } from "@/lib/hooks/useProfiles";
import { usePerformanceSettings } from "@/lib/hooks/useSettings";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";

/**
 * Voice profile card: select (with engine-compatibility dimming), edit,
 * export, delete (confirmed). Off-screen cards render lazily unless
 * performance mode opts into speed-over-RAM.
 */
export function ProfileCard({
	profile,
	disabled,
}: {
	profile: VoiceProfileResponse;
	disabled?: boolean;
}) {
	const { t } = useTranslation();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const deleteProfile = useDeleteProfile();
	const exportProfile = useExportProfile();
	const setEditingId = useUIStore((s) => s.setEditingProfileId);
	const setDialogOpen = useUIStore((s) => s.setProfileDialogOpen);
	const selectedId = useUIStore((s) => s.selectedProfileId);
	const setSelectedId = useUIStore((s) => s.setSelectedProfileId);
	const { settings: perf } = usePerformanceSettings();
	const perfMode = perf?.performance_mode ?? false;
	const selected = selectedProfileId === profile.id;

	const select = () => {
		if (disabled && selected) {
			setSelectedProfileId(null);
			window.setTimeout(() => setSelectedProfileId(profile.id), 0);
			return;
		}
		setSelectedId(selected ? null : profile.id);
	};

	return (
		<>
			<Card
				role="button"
				tabIndex={0}
				aria-pressed={selected}
				aria-label={t(selected ? "profiles.card.selectLabelSelected" : "profiles.card.selectLabel", {
					name: profile.name,
					language: profile.language,
				})}
				onClick={select}
				onKeyDown={(e) => {
					if (e.target instanceof HTMLElement && e.target.closest("button")) {
						return;
					}
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						select();
					}
				}}
				className={cn(
					"flex h-[120px] cursor-pointer flex-col p-2 transition-shadow",
					!perfMode && "[content-visibility:auto] [contain-intrinsic-size:120px]",
					disabled ? "opacity-40 hover:opacity-60" : "hover:shadow-md",
					selected && !disabled && "border-accent shadow-md",
				)}
			>
				<p className="break-words text-sm font-medium leading-tight text-foreground">
					{profile.name}
				</p>
				<p className="mb-1 mt-0.5 line-clamp-1 text-xs leading-snug text-muted-foreground">
					{profile.description || t("profiles.card.noDescription")}
				</p>
				<p className="mb-1 flex items-center gap-1.5">
					<Badge tone="neutral">{profile.language}</Badge>
					{profile.voice_type === "preset" ? (
						<Badge tone="neutral">
							{ENGINE_DISPLAY_NAMES[profile.preset_engine ?? ""] ?? profile.preset_engine}
						</Badge>
					) : null}
					{profile.voice_type === "designed" ? (
						<Badge tone="neutral">{t("profiles.card.designed")}</Badge>
					) : null}
					{profile.effects_chain && profile.effects_chain.length > 0 ? (
						<SparklesIcon className="size-3 fill-accent text-accent" aria-label="Has effects" />
					) : null}
				</p>
				<CardBody className="mt-auto flex items-end justify-end gap-0.5 p-0">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							exportProfile.mutate(profile.id);
						}}
						disabled={exportProfile.isPending}
						title={t("profiles.card.export")}
						aria-label={`${t("profiles.card.export")}: ${profile.name}`}
						className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
					>
						<ArrowDownTrayIcon className="size-3.5" aria-hidden="true" />
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							setEditingId(profile.id);
							setDialogOpen(true);
						}}
						title={t("profiles.card.edit")}
						aria-label={`${t("profiles.card.edit")}: ${profile.name}`}
						className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					>
						<PencilIcon className="size-3.5" aria-hidden="true" />
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							setConfirmDelete(true);
						}}
						disabled={deleteProfile.isPending}
						title={t("profiles.card.delete")}
						aria-label={`${t("profiles.card.delete")}: ${profile.name}`}
						className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-40"
					>
						<TrashIcon className="size-3.5" aria-hidden="true" />
					</button>
				</CardBody>
			</Card>

			<Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<DialogContent>
					<DialogTitle>{t("profiles.deleteDialog.title")}</DialogTitle>
					<DialogDescription>
						{t("profiles.deleteDialog.body", { name: profile.name })}
					</DialogDescription>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setConfirmDelete(false)}>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							disabled={deleteProfile.isPending}
							loading={deleteProfile.isPending}
							onClick={() => {
								deleteProfile.mutate(profile.id);
								setConfirmDelete(false);
							}}
						>
							{deleteProfile.isPending ? t("profiles.deleteDialog.deleting") : t("common.delete")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
