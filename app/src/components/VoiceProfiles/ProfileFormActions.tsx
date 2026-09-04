import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface ProfileFormActionsProps {
	editingProfileId: string | null;
	createPending: boolean;
	updatePending: boolean;
	addSamplePending: boolean;
	onCancel: () => void;
}

export function ProfileFormActions({
	editingProfileId,
	createPending,
	updatePending,
	addSamplePending,
	onCancel,
}: ProfileFormActionsProps) {
	const { t } = useTranslation();
	const isPending = createPending || updatePending || addSamplePending;

	return (
		<div className="flex gap-2 justify-end mt-6 pt-4 border-t">
			<Button type="button" variant="outline" onClick={onCancel}>
				{t("common.cancel")}
			</Button>
			<Button type="submit" disabled={isPending}>
				{isPending
					? t("profileForm.actions.saving")
					: editingProfileId
						? t("profileForm.actions.saveChanges")
						: t("profileForm.actions.createProfile")}
			</Button>
		</div>
	);
}
