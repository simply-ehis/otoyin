import {
	ArrowUpTrayIcon,
	ChevronDoubleLeftIcon,
	ChevronDoubleRightIcon,
	ClockIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RecordAudioButton } from "@/features/capture/RecordAudioButton";
import { useHistory } from "@/lib/hooks/useHistory";
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
import { GenerationProgressList } from "./GenerationProgressList";
import { GettingStarted } from "./GettingStarted";
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
	// History starts as a thin rail; expands on click or when the user wants it.
	const [historyOpen, setHistoryOpen] = useState(false);
	const { data: historySummary } = useHistory({ limit: 1, offset: 0 });
	const historyTotal = historySummary?.total ?? 0;

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
			<div className="flex shrink-0 items-center gap-2 pb-3">
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
			<div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_auto]">
				<div className="min-h-0 flex-1 overflow-y-auto pb-4">
					<GettingStarted />
					<div className="mt-4">
						<PromptBar />
					</div>
					<div className="mt-2">
						<GenerationProgressList />
					</div>
				</div>

				{historyOpen ? (
					<aside
						aria-label="Generation history"
						className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card p-3 max-lg:order-3 lg:w-[400px] w-full"
					>
						<div className="-mt-1 mb-1 flex justify-end">
							<button
								type="button"
								onClick={() => setHistoryOpen(false)}
								className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
								aria-label="Collapse history"
								title="Collapse history"
							>
								<ChevronDoubleRightIcon className="size-4" aria-hidden="true" />
							</button>
						</div>
						<HistoryList />
					</aside>
				) : (
					<>
						{/* Mobile: full history stacked below the prompt (as before) */}
						<aside
							aria-label="Generation history"
							className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card p-3 max-lg:order-3 max-lg:flex w-full lg:hidden"
						>
							<HistoryList />
						</aside>
						{/* Desktop: thin collapsed rail with count badge */}
						<button
							type="button"
							onClick={() => setHistoryOpen(true)}
							className="hidden w-12 shrink-0 flex-col items-center gap-2 self-start rounded-md border border-border bg-card py-4 transition-colors hover:bg-muted/50 lg:flex"
							aria-label={`Open generation history (${historyTotal} items)`}
							title={`Generation history — ${historyTotal} item${historyTotal === 1 ? "" : "s"}`}
						>
							<ClockIcon
								className="size-5 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
								{historyTotal}
							</span>
							<ChevronDoubleLeftIcon
								className="size-3.5 text-muted-foreground/60"
								aria-hidden="true"
							/>
						</button>
					</>
				)}
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
