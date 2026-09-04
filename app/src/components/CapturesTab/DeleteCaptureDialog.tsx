import { useTranslation } from "react-i18next";
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
import { Button } from "@/components/ui/button";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	deleting: boolean;
};

export function DeleteCaptureDialog({
	open,
	onOpenChange,
	onConfirm,
	deleting,
}: Props) {
	const { t } = useTranslation();
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("captures.deleteDialog.title")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("captures.deleteDialog.description")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button
							onClick={onConfirm}
							disabled={deleting}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleting
								? t("captures.deleteDialog.deleting")
								: t("common.delete")}
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
