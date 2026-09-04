import {
	ArrowDownTrayIcon,
	BoltIcon,
	CheckBadgeIcon,
	KeyIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelStatus,
} from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import {
	getDeviceId,
	marketplaceClient,
	openExternalUrl,
} from "@/lib/marketplace";
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

/**
 * Detail-modal action area — the single place to activate / buy / redeem /
 * download / delete. Cached models get a one-step Activate (loadModel).
 */
export function ProductActions({
	product,
	model,
	owned,
	cached,
	ownedNotInstalled,
	isDownloading,
	activating,
	onActivate,
	onDownload,
	onCancel,
	onDelete,
	onDone,
}: Props) {
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [licenseText, setLicenseText] = useState("");
	const [showLicense, setShowLicense] = useState(false);
	const [installing, setInstalling] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [checkingOut, setCheckingOut] = useState(false);

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

	const handleRedeem = async () => {
		if (!licenseText.trim()) {
			return;
		}
		setInstalling(true);
		try {
			const parsed = JSON.parse(licenseText);
			await apiClient.installLicense(parsed);
			setShowLicense(false);
			setLicenseText("");
			await queryClient.invalidateQueries({
				queryKey: ["marketplace", "entitlements"],
			});
			await queryClient.invalidateQueries({ queryKey: ["modelStatus"] });
		} catch (err) {
			showStudioErrorToast(
				err instanceof SyntaxError
					? new Error("License is not valid JSON.")
					: err,
			);
		} finally {
			setInstalling(false);
		}
	};

	const handleDeleteConfirm = () => {
		onDelete(product.id);
		setConfirmDelete(false);
		onDone();
	};

	// ── Checkout: open system browser → poll for license → auto-install ──
	const handleCheckout = async () => {
		setCheckingOut(true);
		try {
			const deviceId = getDeviceId();
			const checkout = await marketplaceClient.createCheckout(
				product.id,
				deviceId,
				"",
			);
			// Open PayProGlobal checkout in system browser
			await openExternalUrl(checkout.checkout_url);
			// Poll for license (user completes payment in browser)
			const license = await marketplaceClient.pollForLicense(
				checkout.order_ref,
			);
			// Auto-install the license
			await marketplaceClient.installLicense(license);
			await queryClient.invalidateQueries({
				queryKey: ["marketplace", "entitlements"],
			});
			await queryClient.invalidateQueries({ queryKey: ["modelStatus"] });
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setCheckingOut(false);
		}
	};

	// Tax preview for paid products
	const taxPreviewQ = useQuery({
		queryKey: ["marketplace", "tax", product.id],
		queryFn: () =>
			marketplaceClient.previewTax(
				product.price_usd,
				"US", // Default; will be updated by region detection
				product.id,
			),
		enabled: product.paid && !owned && !cached,
		staleTime: 5 * 60_000, // 5 min
	});

	return (
		<div className="space-y-3">
			{cached ? (
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium text-success-text">
						<CheckBadgeIcon className="size-4" />
						Installed on this device.
					</div>
					<div className="flex gap-2">
						<Button
							size="sm"
							disabled={activating}
							onClick={() => onActivate?.(product.id)}
							title="Load this engine now — one click, ready to generate"
							className="flex-1"
						>
							{activating ? (
								<Spinner size="xs" />
							) : (
								<BoltIcon className="size-3.5" />
							)}
							{activating ? "Activating…" : "Activate now"}
						</Button>
						{!confirmDelete ? (
							<>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setConfirmDelete(true)}
									className="text-destructive"
								>
									<TrashIcon className="size-3.5" /> Delete model
								</Button>
								<Button variant="ghost" size="sm" onClick={onDone}>
									Done
								</Button>
							</>
						) : (
							<div className="flex gap-2">
								<Button
									size="sm"
									variant="destructive"
									onClick={handleDeleteConfirm}
								>
									<TrashIcon className="size-3.5" /> Confirm delete
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setConfirmDelete(false)}
								>
									Cancel
								</Button>
							</div>
						)}
					</div>
				</div>
			) : showLicense ? (
				<div className="space-y-2">
					<p className="text-xs text-muted-foreground">
						Paste the license JSON you received after purchase. This marketplace
						is the only place to redeem it.
					</p>
					<textarea
						value={licenseText}
						onChange={(e) => setLicenseText(e.target.value)}
						rows={3}
						placeholder='{"license_key":"…","signature":"…"}'
						className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent"
					/>
					<div className="flex gap-2">
						<Button
							size="sm"
							disabled={installing || !licenseText.trim()}
							onClick={handleRedeem}
						>
							{installing ? (
								<Spinner size="xs" />
							) : (
								<KeyIcon className="size-3.5" />
							)}
							{installing ? "Installing…" : "Install License"}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setShowLicense(false)}
						>
							Back
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Need a license? Buy below — you'll get a JSON file to paste here.
					</p>
				</div>
			) : isDownloading ? (
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
			) : product.paid && !owned ? (
				<div className="space-y-2">
					<Button
						size="sm"
						onClick={() => setShowLicense(true)}
						className="w-full"
					>
						<KeyIcon className="size-3.5" /> I have a license — Redeem
					</Button>
					<p className="text-xs text-muted-foreground">
						One-time purchase · Runs offline forever · License is checked
						locally, no internet required.
					</p>
					{taxPreviewQ.data && taxPreviewQ.data.tax_amount > 0 && (
						<p className="text-xs text-muted-foreground">
							+ {taxPreviewQ.data.tax_name} ({taxPreviewQ.data.tax_rate}%) = $
							{taxPreviewQ.data.total.toFixed(2)} total
						</p>
					)}
					<Button
						size="sm"
						className="w-full"
						onClick={handleCheckout}
						disabled={checkingOut}
					>
						{checkingOut ? (
							<>
								<Spinner size="xs" /> Processing…
							</>
						) : (
							`Buy $${product.price_usd} — Get license`
						)}
					</Button>
				</div>
			) : (
				<div className="space-y-2">
					{ownedNotInstalled && (
						<p className="text-xs text-info-text">
							You own this model — your license is verified locally. Download it
							once to use it on this device.
						</p>
					)}
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
							{busy ? "Starting…" : ownedNotInstalled ? "Install" : "Download"}
							{model?.size_mb ? ` · ${formatSize(model.size_mb)}` : ""}
						</Button>
						<Button size="sm" variant="ghost" onClick={onDone}>
							Close
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
