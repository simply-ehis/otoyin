import {
	ArrowUpTrayIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/ui/dialog";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { useImportProfile } from "@/lib/hooks/useProfiles";
import { Composer } from "./Composer";
import { GettingStarted } from "./GettingStarted";
import { HistoryList } from "./HistoryList";
import { VoicePicker } from "./VoicePicker";

/**
 * Generate: pick a voice, compose text, generate, review history.
 * Two-pane studio layout: voice list + composer left, history right.
 */
export function GeneratePage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { toast } = useToast();
	const importProfile = useImportProfile();
	const fileRef = useRef<HTMLInputElement>(null);
	const [importDialogOpen, setImportDialogOpen] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);

	const confirmImport = () => {
		if (!selectedFile) {
			return;
		}
		importProfile.mutate(selectedFile, {
			onSuccess: () => {
				setImportDialogOpen(false);
				setSelectedFile(null);
				if (fileRef.current) {
					fileRef.current.value = "";
				}
				toast({
					title: t("main.import.successTitle"),
					description: t("main.import.successDescription"),
				});
			},
			onError: (error: Error) => {
				toast({
					title: t("main.import.failedTitle"),
					description: error.message,
					variant: "destructive",
				});
			},
		});
	};

	return (
		<div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_400px]">
			<div className="flex min-h-0 flex-col overflow-hidden">
				<ScreenHeader
					title="Otoyin"
					actions={
						<>
							<Button variant="outline" onClick={() => fileRef.current?.click()}>
								<ArrowUpTrayIcon className="mr-2 size-4" aria-hidden="true" />
								{t("main.importVoice")}
							</Button>
							<input
								ref={fileRef}
								type="file"
								accept=".otoyin.zip"
								className="hidden"
								aria-label="Import voice profile archive"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (!file) {
										return;
									}
									if (!file.name.endsWith(".otoyin.zip")) {
										toast({
											title: t("main.import.invalidTitle"),
											description: t("main.import.invalidDescription"),
											variant: "destructive",
										});
										return;
									}
									setSelectedFile(file);
									setImportDialogOpen(true);
								}}
							/>
							<Button onClick={() => navigate({ to: "/voices" })}>
								<SparklesIcon className="mr-2 size-4" aria-hidden="true" />
								{t("main.createVoice")}
							</Button>
						</>
					}
				/>
				<div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-4">
					<GettingStarted />
					<section aria-label="Voices" className="mt-4">
						<VoicePicker />
					</section>
					<div className="mt-4">
						<Composer />
					</div>
				</div>
			</div>

			<aside
				aria-label="Generation history"
				className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card p-3"
			>
				<HistoryList />
			</aside>

			<Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
				<DialogContent>
					<DialogTitle>{t("main.import.dialogTitle")}</DialogTitle>
					<DialogDescription>
						{t("main.import.dialogDescription", { name: selectedFile?.name ?? "" })}
					</DialogDescription>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => {
								setImportDialogOpen(false);
								setSelectedFile(null);
								if (fileRef.current) {
									fileRef.current.value = "";
								}
							}}
						>
							{t("common.cancel")}
						</Button>
						<Button
							onClick={confirmImport}
							disabled={importProfile.isPending || !selectedFile}
							loading={importProfile.isPending}
						>
							{importProfile.isPending
								? t("main.import.importing")
								: t("main.import.action")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
