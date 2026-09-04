import {
	ArrowDownTrayIcon as Download,
	KeyIcon as Key,
	TrashIcon as Trash2,
	WifiIcon as Unplug,
	XMarkIcon as X,
} from "@heroicons/react/24/outline";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/Spinner";
import type {
	ActiveDownloadTask,
	Catalog,
	EntitlementResponse,
	ModelStatus,
} from "@/lib/api/types";
import { formatBytes } from "./modelUtils";
import { getPaidProduct, hasLicense } from "./useModelSections";

export interface ModelState {
	isDownloading: boolean;
	hasError: boolean;
}

export type CancelMutationLike = UseMutationResult<
	unknown,
	unknown,
	string,
	unknown
>;

export type UnloadMutationLike = UseMutationResult<
	unknown,
	unknown,
	string,
	unknown
>;

interface DetailActionProps {
	freshSelectedModel: ModelStatus;
	selectedState: ModelState | null;
	downloadProgressMap: Map<string, ActiveDownloadTask>;
	handleDownload: (modelName: string) => void;
	handleCancel: (modelName: string) => void;
	cancelMutation: CancelMutationLike;
	unloadMutation: UnloadMutationLike;
	setModelToDelete: (model: {
		name: string;
		displayName: string;
		sizeMb?: number;
	}) => void;
	setDeleteDialogOpen: (open: boolean) => void;
	catalog?: Catalog;
	entitlements?: EntitlementResponse;
}

function RetryView({
	freshSelectedModel,
	handleDownload,
	handleCancel,
	cancelMutation,
}: Pick<
	DetailActionProps,
	"freshSelectedModel" | "handleDownload" | "handleCancel" | "cancelMutation"
>) {
	const { t } = useTranslation();
	return (
		<>
			<Button
				size="sm"
				onClick={() => handleDownload(freshSelectedModel.model_name)}
				variant="outline"
				className="flex-1"
			>
				<Download className="size-4 mr-2" />
				{t("models.actions.retry")}
			</Button>
			<Button
				size="sm"
				onClick={() => handleCancel(freshSelectedModel.model_name)}
				variant="ghost"
				disabled={
					cancelMutation.isPending &&
					cancelMutation.variables === freshSelectedModel.model_name
				}
			>
				<X className="size-4" />
			</Button>
		</>
	);
}

function DownloadingView({
	freshSelectedModel,
	downloadProgressMap,
	handleCancel,
	cancelMutation,
}: Pick<
	DetailActionProps,
	| "freshSelectedModel"
	| "downloadProgressMap"
	| "handleCancel"
	| "cancelMutation"
>) {
	const { t } = useTranslation();
	const dl = downloadProgressMap.get(freshSelectedModel.model_name);
	const pct = dl?.progress ?? 0;
	const hasProgress = dl?.total && dl.total > 0;
	return (
		<>
			<div className="flex-1 space-y-2">
				<Progress value={hasProgress ? pct : undefined} className="h-1.5" />
				<div className="text-xs text-muted-foreground">
					{hasProgress
						? `${formatBytes(dl.current ?? 0)} / ${formatBytes(dl.total ?? 0)} (${pct.toFixed(1)}%)`
						: dl?.filename || t("models.progress.connectingHf")}
				</div>
			</div>
			<Button
				size="sm"
				onClick={() => handleCancel(freshSelectedModel.model_name)}
				variant="ghost"
				disabled={
					cancelMutation.isPending &&
					cancelMutation.variables === freshSelectedModel.model_name
				}
			>
				<X className="size-4" />
			</Button>
		</>
	);
}

function DownloadedView({
	freshSelectedModel,
	unloadMutation,
	setModelToDelete,
	setDeleteDialogOpen,
}: Pick<
	DetailActionProps,
	| "freshSelectedModel"
	| "unloadMutation"
	| "setModelToDelete"
	| "setDeleteDialogOpen"
>) {
	const { t } = useTranslation();
	return (
		<div className="flex gap-2 flex-1">
			{freshSelectedModel.loaded && (
				<Button
					size="sm"
					onClick={() => unloadMutation.mutate(freshSelectedModel.model_name)}
					variant="outline"
					disabled={unloadMutation.isPending}
					className="flex-1"
				>
					{unloadMutation.isPending ? (
						<Spinner size="md" className="mr-2" />
					) : (
						<Unplug className="size-4 mr-2" />
					)}
					{unloadMutation.isPending
						? t("models.actions.unloading")
						: t("models.actions.unload")}
				</Button>
			)}
			<Button
				size="sm"
				onClick={() => {
					setModelToDelete({
						name: freshSelectedModel.model_name,
						displayName: freshSelectedModel.display_name,
						sizeMb: freshSelectedModel.size_mb,
					});
					setDeleteDialogOpen(true);
				}}
				variant="outline"
				disabled={freshSelectedModel.loaded}
				title={
					freshSelectedModel.loaded
						? t("models.actions.unloadFirst")
						: t("models.actions.deleteModel")
				}
				className="flex-1"
			>
				<Trash2 className="size-4 mr-2" />
				{t("models.actions.deleteModel")}
			</Button>
		</div>
	);
}

function IdleDownloadButton({
	freshSelectedModel,
	handleDownload,
	licensed,
	paidProduct,
}: Pick<DetailActionProps, "freshSelectedModel" | "handleDownload"> & {
	licensed: boolean;
	paidProduct: { paid: boolean; price_usd: number } | null;
}) {
	const { t } = useTranslation();

	if (paidProduct && !licensed) {
		return (
			<div className="flex-1 space-y-2">
				<div className="flex items-center gap-2 text-xs text-amber-500">
					<Key className="size-3.5" />
					<span>{t("models.actions.licenseRequired")}</span>
				</div>
				<Button
					size="sm"
					variant="outline"
					className="flex-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
					disabled
				>
					<Key className="size-4 mr-2" />${paidProduct.price_usd} —{" "}
					{t("models.actions.purchaseLicense")}
				</Button>
			</div>
		);
	}

	return (
		<Button
			size="sm"
			onClick={() => handleDownload(freshSelectedModel.model_name)}
			className="flex-1"
		>
			<Download className="size-4 mr-2" />
			{t("models.actions.download")}
		</Button>
	);
}

export function DetailActions({
	freshSelectedModel,
	selectedState,
	downloadProgressMap,
	handleDownload,
	handleCancel,
	cancelMutation,
	unloadMutation,
	setModelToDelete,
	setDeleteDialogOpen,
	catalog,
	entitlements,
}: DetailActionProps) {
	const licensed = hasLicense(
		freshSelectedModel.model_name,
		catalog,
		entitlements,
	);
	const paidProduct = getPaidProduct(freshSelectedModel.model_name, catalog);

	return (
		<div className="flex items-center gap-2 pt-2">
			{selectedState?.hasError ? (
				<RetryView
					freshSelectedModel={freshSelectedModel}
					handleDownload={handleDownload}
					handleCancel={handleCancel}
					cancelMutation={cancelMutation}
				/>
			) : selectedState?.isDownloading ? (
				<DownloadingView
					freshSelectedModel={freshSelectedModel}
					downloadProgressMap={downloadProgressMap}
					handleCancel={handleCancel}
					cancelMutation={cancelMutation}
				/>
			) : freshSelectedModel.downloaded ? (
				<DownloadedView
					freshSelectedModel={freshSelectedModel}
					unloadMutation={unloadMutation}
					setModelToDelete={setModelToDelete}
					setDeleteDialogOpen={setDeleteDialogOpen}
				/>
			) : (
				<IdleDownloadButton
					freshSelectedModel={freshSelectedModel}
					handleDownload={handleDownload}
					licensed={licensed}
					paidProduct={paidProduct}
				/>
			)}
		</div>
	);
}
