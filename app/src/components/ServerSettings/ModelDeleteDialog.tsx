import type { UseMutationResult } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/Spinner";
import { formatSize } from "./modelUtils";

type DeleteMutationLike = UseMutationResult<unknown, unknown, string, unknown>;

interface ModelToDelete {
	name: string;
	displayName: string;
	sizeMb?: number;
}

interface ModelDeleteDialogProps {
	deleteDialogOpen: boolean;
	setDeleteDialogOpen: (open: boolean) => void;
	modelToDelete: ModelToDelete | null;
	deleteMutation: DeleteMutationLike;
}

export function ModelDeleteDialog({
	deleteDialogOpen,
	setDeleteDialogOpen,
	modelToDelete,
	deleteMutation,
}: ModelDeleteDialogProps) {
	const { t } = useTranslation();

	return (
		<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("models.deleteDialog.title")}</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans
							i18nKey="models.deleteDialog.body"
							values={{ name: modelToDelete?.displayName }}
							components={{ strong: <strong /> }}
						/>
						{modelToDelete?.sizeMb && (
							<>
								{" "}
								{t("models.deleteDialog.sizeNote", {
									size: formatSize(modelToDelete.sizeMb),
								})}
							</>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => {
							if (modelToDelete) {
								deleteMutation.mutate(modelToDelete.name);
							}
						}}
						disabled={deleteMutation.isPending}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{deleteMutation.isPending ? (
							<>
								<Spinner size="md" className="mr-2" />
								{t("models.deleteDialog.deleting")}
							</>
						) : (
							t("common.delete")
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
