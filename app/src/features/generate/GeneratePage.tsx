import { ArrowUpTrayIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RecordAudioButton } from "@/features/capture/RecordAudioButton";
import { useImportProfile } from "@/lib/hooks/useProfiles";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/ui/dialog";
import { useToast } from "@/ui/use-toast";
import { GettingStarted } from "./GettingStarted";
import { GenerationProgressList } from "./GenerationProgressList";
import { HistoryList } from "./HistoryList";
import { PromptBar } from "./PromptBar";

const TabHelp = lazy(() =>
	import("@/features/help/TabHelp").then((m) => ({ default: m.TabHelp })),
);

/**
 * Generate: pick a voice, type a script, generate, review history.
 * Layout: getting-started checklist + compact prompt bar left, history right.
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
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="flex items-center justify-between gap-2 pb-3">
				<h1 className="flex min-w-0 items-center">
					<img
						src="/otoyin-logo.svg"
						alt="Otoyin"
						className="h-8 w-8 shrink-0"
					/>
				</h1>
				<div className="flex shrink-0 items-center gap-2">
					<Suspense fallback={null}>
						<TabHelp tabPath="/" />
					</Suspense>
					<RecordAudioButton compact />
					<Button
						type="button"
						variant="outline"
						size="sm"
						title={t("main.importVoice")}
						aria-label={t("main.importVoice")}
						onClick={() => fileRef.current?.click()}
					>
						<ArrowUpTrayIcon className="mr-1.5 size-3.5" aria-hidden="true" />
						{t("main.importVoice")}
					</Button>
					<Button
						type="button"
						size="sm"
						title={t("main.createVoice")}
						aria-label={t("main.createVoice")}
						onClick={() => navigate({ to: "/voices" })}
					>
						<SparklesIcon className="mr-1.5 size-3.5" aria-hidden="true" />
						{t("main.createVoice")}
					</Button>
				</div>
			</div>
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
			<div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_400px]">
				<div className="min-h-0 flex-1 overflow-y-auto pb-4">
					<GettingStarted />
					<div className="mt-4">
						<PromptBar />
					</div>
					<div className="mt-2">
						<GenerationProgressList />
					</div>
				</div>

				<aside
					aria-label="Generation history"
					className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card p-3 max-lg:order-3"
				>
					<HistoryList />
				</aside>
			</div>

			<Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
				<DialogContent>
					<DialogTitle>{t("main.import.dialogTitle")}</DialogTitle>
					<DialogDescription>
						{t("main.import.dialogDescription", {
							name: selectedFile?.name ?? "",
						})}
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
