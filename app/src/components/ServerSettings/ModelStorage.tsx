import {
	FolderOpenIcon as FolderOpen,
	ArrowUturnLeftIcon as RotateCcw,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/use-toast";
import { usePlatform } from "@/platform/PlatformContext";
import { useServerStore } from "@/stores/serverStore";

interface CacheDir {
	path: string;
}

interface ModelStorageProps {
	cacheDir: CacheDir;
	migrating: boolean;
	setPendingMigrateDir: (dir: string | null) => void;
}

export function ModelStorage({
	cacheDir,
	migrating,
	setPendingMigrateDir,
}: ModelStorageProps) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const platform = usePlatform();
	const customModelsDir = useServerStore((state) => state.customModelsDir);
	const setCustomModelsDir = useServerStore(
		(state) => state.setCustomModelsDir,
	);

	return (
		<div className="shrink-0 pb-4 border-b mb-4">
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0">
					<span className="text-xs text-muted-foreground">
						{t("models.storage.location")}
					</span>
					<p
						className="text-xs font-mono text-muted-foreground/70 truncate"
						title={cacheDir.path}
					>
						{cacheDir.path}
					</p>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<Button
						variant="ghost"
						size="sm"
						className="text-xs text-muted-foreground h-7 px-2"
						onClick={async () => {
							try {
								await platform.filesystem.openPath(cacheDir.path);
							} catch {
								toast({
									title: t("models.toast.openFolderFailed"),
									variant: "destructive",
								});
							}
						}}
					>
						<FolderOpen className="size-3" />
						{t("models.storage.open")}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="text-xs text-muted-foreground h-7 px-2"
						onClick={async () => {
							try {
								const newDir = await platform.filesystem.pickDirectory(
									t("models.storage.pickerTitle"),
								);
								if (!newDir) {
									return;
								}
								setPendingMigrateDir(newDir);
							} catch {
								toast({
									title: t("models.toast.pickerFailed"),
									variant: "destructive",
								});
							}
						}}
						disabled={migrating}
					>
						{migrating ? (
							<Spinner size="xs" />
						) : (
							<FolderOpen className="size-3" />
						)}
						{migrating
							? t("models.storage.migrating")
							: t("models.storage.change")}
					</Button>
					{customModelsDir && (
						<Button
							variant="ghost"
							size="sm"
							className="text-xs text-muted-foreground h-7 px-2"
							disabled={migrating}
							onClick={async () => {
								setCustomModelsDir(null);
								toast({ title: t("models.toast.resetToDefault") });
								await platform.lifecycle.restartServer("");
								queryClient.invalidateQueries();
							}}
						>
							<RotateCcw className="size-3" />
							{t("models.storage.reset")}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
