import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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
import { CodeConsole } from "@/components/ui/code-console";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { usePlatform } from "@/platform/PlatformContext";
import { useServerStore } from "@/stores/serverStore";
import { formatBytes } from "./modelUtils";

interface MigrationProgress {
	current: number;
	total: number;
	progress: number;
	filename?: string;
	status: string;
}

interface MigrationOverlayProps {
	migrationProgress: MigrationProgress;
}

function MigrationOverlay({ migrationProgress }: MigrationOverlayProps) {
	const { t } = useTranslation();

	return (
		<div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
			<div className="w-full max-w-md px-8 space-y-6 text-center">
				<div className="space-y-2">
					<Spinner size="xxl" className="mx-auto" />
					<h2 className="text-lg font-semibold">{t("models.migrate.title")}</h2>
					<p className="text-sm text-muted-foreground">
						{migrationProgress.status === "complete"
							? t("models.migrateDialog.restartingServer")
							: t("models.migrate.offline")}
					</p>
				</div>
				{migrationProgress.total > 0 && (
					<div className="space-y-2">
						<Progress value={migrationProgress.progress} className="h-2" />
						<div className="flex justify-between text-xs text-muted-foreground">
							<span className="truncate max-w-[60%]">
								{migrationProgress.filename}
							</span>
							<span>
								{formatBytes(migrationProgress.current)} /{" "}
								{formatBytes(migrationProgress.total)}
							</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

interface ModelMigrationProps {
	pendingMigrateDir: string | null;
	setPendingMigrateDir: (dir: string | null) => void;
	migrating: boolean;
	setMigrating: (v: boolean) => void;
	migrationProgress: MigrationProgress | null;
	setMigrationProgress: (p: MigrationProgress | null) => void;
}

interface MigrationArgs {
	pendingMigrateDir: string | null;
	setPendingMigrateDir: (dir: string | null) => void;
	setMigrating: (v: boolean) => void;
	setMigrationProgress: (p: MigrationProgress | null) => void;
	setCustomModelsDir: (dir: string) => void;
	platform: ReturnType<typeof usePlatform>;
	queryClient: ReturnType<typeof useQueryClient>;
	t: ReturnType<typeof useTranslation>["t"];
	toast: ReturnType<typeof useToast>["toast"];
}

export function ModelMigration({
	pendingMigrateDir,
	setPendingMigrateDir,
	migrating,
	setMigrating,
	migrationProgress,
	setMigrationProgress,
}: ModelMigrationProps) {
	const eventSourceRef = useRef<EventSource | null>(null);

	useEffect(() => {
		return () => {
			eventSourceRef.current?.close();
			eventSourceRef.current = null;
		};
	}, []);

	async function runMigration({
		pendingMigrateDir,
		setPendingMigrateDir,
		setMigrating,
		setMigrationProgress,
		setCustomModelsDir,
		platform,
		queryClient,
		t,
		toast,
	}: MigrationArgs) {
		if (!pendingMigrateDir) {
			return;
		}
		const newDir = pendingMigrateDir;
		setPendingMigrateDir(null);
		setMigrating(true);
		setMigrationProgress({
			current: 0,
			total: 0,
			progress: 0,
			status: "downloading",
			filename: t("models.migrateDialog.preparing"),
		});
		try {
			const migrationResult = await apiClient.migrateModels(newDir);
			if (migrationResult.moved === 0) {
				toast({
					title: t("models.toast.noModelsToMigrate"),
					description: t("models.toast.noModelsToMigrateDescription"),
				});
				return;
			}
			await new Promise<void>((resolve, reject) => {
				const es = new EventSource(apiClient.getMigrationProgressUrl());
				eventSourceRef.current = es;
				es.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);
						setMigrationProgress(data);
						if (data.status === "complete") {
							es.close();
							resolve();
						} else if (data.status === "error") {
							es.close();
							reject(
								new Error(data.error || t("models.toast.migrationFailed")),
							);
						}
					} catch {
						/* ignore parse errors */
					}
				};
				es.onerror = () => {
					es.close();
					reject(new Error(t("models.toast.migrationConnectionLost")));
				};
			});
			setMigrationProgress({
				current: 1,
				total: 1,
				progress: 100,
				status: "complete",
				filename: t("models.migrateDialog.restartingServer"),
			});
			await platform.lifecycle.restartServer(newDir);
			setCustomModelsDir(newDir);
			queryClient.invalidateQueries();
			toast({ title: t("models.toast.migrated") });
		} catch (e) {
			toast({
				title: t("models.toast.migrationFailed"),
				description:
					e instanceof Error
						? e.message
						: t("models.toast.migrationFailedGeneric"),
				variant: "destructive",
			});
		} finally {
			eventSourceRef.current?.close();
			eventSourceRef.current = null;
			setMigrating(false);
			setMigrationProgress(null);
		}
	}

	const { t } = useTranslation();
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const platform = usePlatform();
	const setCustomModelsDir = useServerStore(
		(state) => state.setCustomModelsDir,
	);

	const handleMigrate = () =>
		runMigration({
			pendingMigrateDir,
			setPendingMigrateDir,
			setMigrating,
			setMigrationProgress,
			setCustomModelsDir,
			platform,
			queryClient,
			t,
			toast,
		});

	return (
		<>
			<AlertDialog
				open={!!pendingMigrateDir}
				onOpenChange={(open) => !open && setPendingMigrateDir(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("models.migrateDialog.title")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("models.migrateDialog.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<CodeConsole className="truncate" title={pendingMigrateDir ?? ""}>
						{pendingMigrateDir}
					</CodeConsole>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction onClick={handleMigrate}>
							{t("models.migrateDialog.action")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{migrating && migrationProgress && (
				<MigrationOverlay migrationProgress={migrationProgress} />
			)}
		</>
	);
}
