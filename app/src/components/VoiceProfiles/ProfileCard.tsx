import {
	ArrowDownTrayIcon as Download,
	PencilIcon as Edit,
	SparklesIcon as Sparkles,
	TrashIcon as Trash2,
	SparklesIcon as Wand2,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CircleButton } from "@/components/ui/circle-button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { VoiceProfileResponse } from "@/lib/api/types";
import { ENGINE_DISPLAY_NAMES } from "@/lib/constants/engines";
import { useDeleteProfile, useExportProfile } from "@/lib/hooks/useProfiles";
import { usePerformanceSettings } from "@/lib/hooks/useSettings";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";

interface ProfileCardProps {
	profile: VoiceProfileResponse;
	disabled?: boolean;
}

export function ProfileCard({ profile, disabled }: ProfileCardProps) {
	const { t } = useTranslation();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const deleteProfile = useDeleteProfile();
	const exportProfile = useExportProfile();
	const setEditingProfileId = useUIStore((state) => state.setEditingProfileId);
	const { settings: perfSettings } = usePerformanceSettings();
	// When Performance Mode is ON we render everything immediately (speed over RAM);
	// otherwise we let the browser skip off-screen cards (RAM over speed).
	const perfMode = perfSettings?.performance_mode ?? false;
	const setProfileDialogOpen = useUIStore(
		(state) => state.setProfileDialogOpen,
	);
	const selectedProfileId = useUIStore((state) => state.selectedProfileId);
	const setSelectedProfileId = useUIStore(
		(state) => state.setSelectedProfileId,
	);

	const isSelected = selectedProfileId === profile.id;

	const handleSelect = () => {
		if (disabled && isSelected) {
			setSelectedProfileId(null);
			setTimeout(() => setSelectedProfileId(profile.id), 0);
			return;
		}
		setSelectedProfileId(isSelected ? null : profile.id);
	};

	const handleEdit = () => {
		setEditingProfileId(profile.id);
		setProfileDialogOpen(true);
	};

	const handleDeleteClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		setDeleteDialogOpen(true);
	};

	const handleDeleteConfirm = () => {
		deleteProfile.mutate(profile.id);
		setDeleteDialogOpen(false);
	};

	const handleExport = (e: React.MouseEvent) => {
		e.stopPropagation();
		exportProfile.mutate(profile.id);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		const target = e.target as HTMLElement;
		if (target.closest("button")) {
			return;
		}
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleSelect();
		}
	};

	const selectLabel = t(
		isSelected
			? "profiles.card.selectLabelSelected"
			: "profiles.card.selectLabel",
		{ name: profile.name, language: profile.language },
	);

	return (
		<>
			<Card
				className={cn(
					"cursor-pointer transition-[opacity,box-shadow] flex flex-col h-[120px]",
					!perfMode &&
						"[content-visibility:auto] [contain-intrinsic-size:120px]",
					disabled ? "opacity-40 hover:opacity-60" : "hover:shadow-md",
					isSelected &&
						!disabled &&
						"ring-2 border-transparent ring-accent shadow-md",
				)}
				onClick={handleSelect}
				tabIndex={0}
				role="button"
				aria-label={selectLabel}
				aria-pressed={isSelected}
				onKeyDown={handleKeyDown}
			>
				<CardHeader className="p-2 pb-1">
					<CardTitle className="text-sm font-medium leading-tight">
						<span className="break-words">{profile.name}</span>
					</CardTitle>
				</CardHeader>
				<CardContent className="p-2 pt-0 flex flex-col flex-1">
					<p className="text-xs text-muted-foreground mb-1 line-clamp-1 leading-snug">
						{profile.description || t("profiles.card.noDescription")}
					</p>
					<div className="mb-1 flex items-center gap-2">
						<Badge
							variant="outline"
							className="text-xs h-4 px-1 text-muted-foreground"
						>
							{profile.language}
						</Badge>
						{profile.voice_type === "preset" && (
							<Badge variant="secondary" className="text-xs h-4 px-1">
								{ENGINE_DISPLAY_NAMES[profile.preset_engine ?? ""] ??
									profile.preset_engine}
							</Badge>
						)}
						{profile.voice_type === "designed" && (
							<Badge variant="secondary" className="text-xs h-4 px-1">
								{t("profiles.card.designed")}
							</Badge>
						)}
						{profile.effects_chain && profile.effects_chain.length > 0 && (
							<Sparkles className="size-3 text-accent fill-accent" />
						)}
						{profile.personality?.trim() && (
							<Wand2 className="size-3 text-accent" />
						)}
					</div>
					<div className="flex gap-0.5 justify-end items-end mt-auto">
						<CircleButton
							icon={Download}
							onClick={handleExport}
							disabled={exportProfile.isPending}
							aria-label={t("profiles.card.export")}
						/>
						<CircleButton
							icon={Edit}
							onClick={(e) => {
								e.stopPropagation();
								handleEdit();
							}}
							aria-label={t("profiles.card.edit")}
						/>
						<CircleButton
							icon={Trash2}
							onClick={handleDeleteClick}
							disabled={deleteProfile.isPending}
							aria-label={t("profiles.card.delete")}
						/>
					</div>
				</CardContent>
			</Card>

			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("profiles.deleteDialog.title")}</DialogTitle>
						<DialogDescription>
							{t("profiles.deleteDialog.body", { name: profile.name })}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeleteDialogOpen(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={handleDeleteConfirm}
							disabled={deleteProfile.isPending}
						>
							{deleteProfile.isPending
								? t("profiles.deleteDialog.deleting")
								: t("common.delete")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
