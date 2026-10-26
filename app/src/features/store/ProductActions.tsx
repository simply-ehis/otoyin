import {
	ArrowDownTrayIcon,
	CheckBadgeIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelStatus,
} from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";
import { formatSize } from "./storeUtils";

interface Props {
	product: MarketplaceProduct;
	model?: ModelStatus;
	owned: boolean;
	cached: boolean;
	ownedNotInstalled: boolean;
	downloadTask?: ActiveDownloadTask;
	isDownloading: boolean;
	activating?: boolean;
	onActivate?: (id: string) => void;
	onDownload: (id: string) => Promise<unknown> | unknown;
	onCancel: (id: string) => void;
	onDelete: (id: string) => void;
	onDone: () => void;
}

export function ProductActions({
	product,
	model,
	cached,
	isDownloading,
	activating,
	onActivate,
	onDownload,
	onCancel,
	onDelete,
	onDone,
}: Props) {
	const [busy, setBusy] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const handleDownload = async () => {
		setBusy(true);
		try {
			await onDownload(product.id);
		} catch (e) {
			showStudioErrorToast(e);
		} finally {
			setBusy(false);
		}
	};

	const handleDeleteConfirm = () => {
		onDelete(product.id);
		setConfirmDelete(false);
		onDone();
	};

	if (cached) {
		return (
			<div className="space-y-2">
				<Button
					size="sm"
					disabled={activating}
					onClick={() => onActivate?.(product.id)}
					className="w-full"
				>
					{activating ? (
						<>
							<Spinner size="xs" /> Activating…
						</>
					) : (
						<>
							<CheckBadgeIcon className="size-3.5" /> Activate
						</>
					)}
				</Button>
				<Button size="sm" variant="ghost" onClick={onDone} className="w-full">
					Close
				</Button>
			</div>
		);
	}

	if (isDownloading) {
		return (
			<div className="flex gap-2">
				<Button size="sm" variant="outline" disabled className="flex-1">
					<Spinner size="xs" /> Downloading…
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => onCancel(product.id)}
				>
					Cancel
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={busy}
					onClick={handleDownload}
					className="flex-1"
				>
					{busy ? (
						<Spinner size="xs" />
					) : (
						<ArrowDownTrayIcon className="size-3.5" />
					)}
					{busy ? "Starting…" : "Download"}
					{model?.size_mb ? ` · ${formatSize(model.size_mb)}` : ""}
				</Button>
				<Button size="sm" variant="ghost" onClick={onDone}>
					Close
				</Button>
			</div>
			{confirmDelete ? (
				<div className="flex gap-2">
					<Button
						size="sm"
						variant="destructive"
						onClick={handleDeleteConfirm}
						className="flex-1"
					>
						Confirm delete
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setConfirmDelete(false)}
					>
						Cancel
					</Button>
				</div>
			) : (
				<Button
					size="sm"
					variant="ghost"
					onClick={() => setConfirmDelete(true)}
					className="w-full"
				>
					<TrashIcon className="size-3.5" /> Delete
				</Button>
			)}
		</div>
	);
}