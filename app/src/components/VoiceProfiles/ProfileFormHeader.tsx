import { XMarkIcon as X } from "@heroicons/react/24/outline";
import type { UseFormReset } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ProfileFormValues } from "./profileFormHelpers";

interface ProfileFormHeaderProps {
	editingProfileId: string | null;
	hasDraft: boolean;
	onDiscardDraft: () => void;
	formReset: UseFormReset<ProfileFormValues>;
	onSetSampleModeRecord: () => void;
}

export function ProfileFormHeader({
	editingProfileId,
	hasDraft,
	onDiscardDraft,
	formReset,
	onSetSampleModeRecord,
}: ProfileFormHeaderProps) {
	const { t } = useTranslation();

	return (
		<DialogHeader>
			<DialogTitle className="text-2xl">
				{editingProfileId
					? t("profileForm.editTitle")
					: t("profileForm.createTitle")}
			</DialogTitle>
			<DialogDescription>
				{editingProfileId
					? t("profileForm.editDescription")
					: t("profileForm.createDescription")}
			</DialogDescription>
			{hasDraft && (
				<div className="flex items-center gap-2 pt-2">
					<span className="text-xs text-muted-foreground">
						{t("profileForm.draftRestored")}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-xs text-muted-foreground"
						onClick={() => {
							onDiscardDraft();
							formReset({
								name: "",
								description: "",
								language: "en",
								personality: "",
								sampleFile: undefined,
								referenceText: "",
								avatarFile: undefined,
							});
							onSetSampleModeRecord();
						}}
					>
						<X className="size-3 mr-1" />
						{t("profileForm.discard")}
					</Button>
				</div>
			)}
		</DialogHeader>
	);
}
