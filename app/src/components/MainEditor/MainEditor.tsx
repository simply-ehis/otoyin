import {
	SparklesIcon as Sparkles,
	ArrowUpTrayIcon as Upload,
} from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FloatingGenerateBox } from "@/components/Generation/FloatingGenerateBox";
import { GettingStarted } from "@/components/GettingStarted/GettingStarted";
import { HistoryTable } from "@/components/History/HistoryTable";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ProfileList } from "@/components/VoiceProfiles/ProfileList";
import { useImportProfile } from "@/lib/hooks/useProfiles";
import { useUIStore } from "@/stores/uiStore";

export function MainEditor() {
	const { t } = useTranslation();
	const scrollRef = useRef<HTMLDivElement>(null);
	const setDialogOpen = useUIStore((state) => state.setProfileDialogOpen);
	const importProfile = useImportProfile();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [importDialogOpen, setImportDialogOpen] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const { toast } = useToast();

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
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
		}
	};

	const handleImportConfirm = () => {
		if (selectedFile) {
			importProfile.mutate(selectedFile, {
				onSuccess: () => {
					setImportDialogOpen(false);
					setSelectedFile(null);
					if (fileInputRef.current) {
						fileInputRef.current.value = "";
					}
					toast({
						title: t("main.import.successTitle"),
						description: t("main.import.successDescription"),
					});
				},
				onError: (error) => {
					toast({
						title: t("main.import.failedTitle"),
						description: error.message,
						variant: "destructive",
					});
				},
			});
		}
	};

	return (
		<div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] lg:gap-4 h-full min-h-0 overflow-hidden">
			<div className="flex flex-col min-h-0 overflow-hidden">
				<div className="shrink-0 px-1 pb-4">
					<div className="flex items-center justify-between">
						<h2 className="text-2xl font-bold">Otoyin</h2>
						<div className="flex gap-2">
							<Button variant="outline" onClick={handleImportClick}>
								<Upload className="mr-2 size-4" />
								{t("main.importVoice")}
							</Button>
							<input
								ref={fileInputRef}
								type="file"
								accept=".otoyin.zip"
								onChange={handleFileChange}
								className="hidden"
							/>
							<Button onClick={() => setDialogOpen(true)}>
								<Sparkles className="mr-2 size-4" />
								{t("main.createVoice")}
							</Button>
						</div>
					</div>
				</div>

				<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pb-4">
					<GettingStarted />
					<div className="flex flex-col gap-6">
						<div className="shrink-0 flex flex-col">
							<ProfileList />
						</div>
					</div>
				</div>

				<FloatingGenerateBox />
			</div>

			<div className="flex flex-col min-h-0 overflow-hidden border border-border rounded-xl bg-card shadow-sm">
				<HistoryTable />
			</div>

			<Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("main.import.dialogTitle")}</DialogTitle>
						<DialogDescription>
							{t("main.import.dialogDescription", { name: selectedFile?.name })}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setImportDialogOpen(false);
								setSelectedFile(null);
								if (fileInputRef.current) {
									fileInputRef.current.value = "";
								}
							}}
						>
							{t("common.cancel")}
						</Button>
						<Button
							onClick={handleImportConfirm}
							disabled={importProfile.isPending || !selectedFile}
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
