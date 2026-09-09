import {
	ArrowDownTrayIcon,
	ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { downloadBlob } from "@/lib/utils/download";
import { Button } from "@/ui/button";
import { Card, CardBody, CardTitle } from "@/ui/card";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

export function PrivacyPage() {
	const { toast } = useToast();
	const [exporting, setExporting] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [confirmationToken, setConfirmationToken] = useState<string | null>(
		null,
	);

	const handleExport = useCallback(async () => {
		setExporting(true);
		try {
			const blob = await apiClient.exportData();
			downloadBlob(
				blob,
				`otoyin-export-${new Date().toISOString().slice(0, 10)}.zip`,
			);

			toast({
				title: "Data exported",
				description: "Your data has been downloaded as a ZIP file.",
			});
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setExporting(false);
		}
	}, [toast]);

	const handleRequestDelete = useCallback(async () => {
		try {
			const data = await apiClient.requestDeleteConfirm();
			setConfirmationToken(data.confirmation_token);
			toast({
				title: "Confirmation required",
				description:
					"Click 'Permanently Delete' again to confirm. This cannot be undone.",
			});
		} catch (err) {
			showStudioErrorToast(err);
		}
	}, [toast]);

	const handleConfirmDelete = useCallback(async () => {
		if (!confirmationToken) {
			return;
		}
		setDeleting(true);
		try {
			await apiClient.confirmDelete(confirmationToken);
			setConfirmationToken(null);
			toast({
				title: "Data deleted",
				description: "All your data has been permanently removed.",
			});
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setDeleting(false);
		}
	}, [confirmationToken, toast]);

	return (
		<div className="flex flex-col h-full min-h-0">
			<ScreenHeader
				title="Privacy"
				description="Your data stays on your device"
			/>

			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				<Card>
					<CardBody>
						<CardTitle>Data Export</CardTitle>
						<p className="text-sm text-muted-foreground mb-3">
							Download all your data as a ZIP archive containing your profiles,
							generations, stories, audio files, and settings.
						</p>
						<Button
							onClick={handleExport}
							disabled={exporting}
							variant="outline"
							size="sm"
						>
							<ArrowDownTrayIcon className="size-4 mr-2" />
							{exporting ? "Exporting..." : "Export All Data"}
						</Button>
					</CardBody>
				</Card>

				<Card className="border-destructive/30">
					<CardBody>
						<CardTitle className="text-destructive flex items-center gap-2">
							<ExclamationTriangleIcon className="size-5" />
							Data Deletion
						</CardTitle>
						<p className="text-sm text-muted-foreground mb-3">
							Permanently delete all your data including profiles, generations,
							stories, audio files, and settings. This action cannot be undone.
						</p>
						{!confirmationToken ? (
							<Button
								onClick={handleRequestDelete}
								variant="destructive"
								size="sm"
							>
								Request Deletion
							</Button>
						) : (
							<Button
								onClick={handleConfirmDelete}
								disabled={deleting}
								variant="destructive"
								size="sm"
							>
								<ExclamationTriangleIcon className="size-4 mr-2" />
								{deleting ? "Deleting..." : "Permanently Delete All Data"}
							</Button>
						)}
					</CardBody>
				</Card>

				<Card>
					<CardBody>
						<CardTitle>Privacy Policy</CardTitle>
						<p className="text-sm text-muted-foreground mb-3">
							Otoyin runs entirely on your device. No data is uploaded unless
							you opt in to telemetry or crash reporting.
						</p>
						<a
							href="https://github.com/anomalyco/otoyin/blob/main/docs/PRIVACY_POLICY.md"
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-primary hover:underline"
						>
							Read the full Privacy Policy
						</a>
					</CardBody>
				</Card>
			</div>
		</div>
	);
}
