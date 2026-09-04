/**
 * Region-specific pricing admin page.
 *
 * Allows administrators to set different prices for products in different
 * countries/regions. Shows a table of all overrides with inline editing.
 */

import {
	ArrowPathIcon,
	CurrencyDollarIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { showStudioErrorToast } from "@/lib/errors";
import { marketplaceClient } from "@/lib/marketplace";

// ── Types ──────────────────────────────────────────────────────────────

interface RegionPrice {
	product_id: string;
	country_code: string;
	price_usd: number;
	note: string;
}

interface PricingSummary {
	total_overrides: number;
	products_with_overrides: number;
	countries_with_overrides: number;
	products: string[];
	countries: string[];
}

// ── Country codes for dropdown ─────────────────────────────────────────

const COUNTRIES: Record<string, string> = {
	US: "United States",
	GB: "United Kingdom",
	NG: "Nigeria",
	DE: "Germany",
	FR: "France",
	ES: "Spain",
	It: "Italy",
	NL: "Netherlands",
	AU: "Australia",
	Ca: "Canada",
	IN: "India",
	BR: "Brazil",
	JP: "Japan",
	KR: "South Korea",
	ZA: "South Africa",
	KE: "Kenya",
	GH: "Ghana",
	SG: "Singapore",
	AE: "UAE",
	SA: "Saudi Arabia",
	CH: "Switzerland",
	SE: "Sweden",
	NO: "Norway",
	DK: "Denmark",
	PL: "Poland",
	TR: "Turkey",
	MX: "Mexico",
	AR: "Argentina",
	CO: "Colombia",
	CL: "Chile",
	PH: "Philippines",
	ID: "Indonesia",
	MY: "Malaysia",
	TH: "Thailand",
	VN: "Vietnam",
	PK: "Pakistan",
	BD: "Bangladesh",
	EG: "Egypt",
};

// ── Main Component ─────────────────────────────────────────────────────

export function PricingAdmin() {
	const queryClient = useQueryClient();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editPrice, setEditPrice] = useState<string>("");
	const [editNote, setEditNote] = useState<string>("");
	const [showAddForm, setShowAddForm] = useState(false);
	const [newProductId, setNewProductId] = useState("");
	const [newCountry, setNewCountry] = useState("US");
	const [newPrice, setNewPrice] = useState("");
	const [newNote, setNewNote] = useState("");

	// Fetch all region prices
	const pricesQuery = useQuery({
		queryKey: ["marketplace", "pricing"],
		queryFn: async () => {
			const resp = await fetch("/api/marketplace/pricing", {
				signal: AbortSignal.timeout(10_000),
			});
			if (!resp.ok) {
				throw new Error("Failed to fetch pricing");
			}
			return resp.json() as Promise<{ prices: RegionPrice[]; count: number }>;
		},
		staleTime: 30_000,
	});

	// Fetch summary
	const summaryQuery = useQuery({
		queryKey: ["marketplace", "pricing", "summary"],
		queryFn: async () => {
			const resp = await fetch("/api/marketplace/pricing/summary", {
				signal: AbortSignal.timeout(10_000),
			});
			if (!resp.ok) {
				throw new Error("Failed to fetch summary");
			}
			return resp.json() as Promise<PricingSummary>;
		},
		staleTime: 30_000,
	});

	// Fetch catalog for product dropdown
	const catalogQuery = useQuery({
		queryKey: ["marketplace", "catalog"],
		queryFn: () => marketplaceClient.fetchCatalog(),
		staleTime: 60_000,
	});

	// Set price mutation
	const setPriceMutation = useMutation({
		mutationFn: async (data: {
			product_id: string;
			country_code: string;
			price_usd: number;
			note: string;
		}) => {
			const resp = await fetch("/api/marketplace/pricing", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});
			if (!resp.ok) {
				throw new Error("Failed to set price");
			}
			return resp.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["marketplace", "pricing"] });
			queryClient.invalidateQueries({
				queryKey: ["marketplace", "pricing", "summary"],
			});
		},
	});

	// Delete price mutation
	const deletePriceMutation = useMutation({
		mutationFn: async ({
			product_id,
			country_code,
		}: {
			product_id: string;
			country_code: string;
		}) => {
			const resp = await fetch(
				`/api/marketplace/pricing/${product_id}/${country_code}`,
				{ method: "DELETE" },
			);
			if (!resp.ok) {
				throw new Error("Failed to delete price");
			}
			return resp.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["marketplace", "pricing"] });
			queryClient.invalidateQueries({
				queryKey: ["marketplace", "pricing", "summary"],
			});
		},
	});

	const products = catalogQuery.data?.products ?? [];
	const prices = pricesQuery.data?.prices ?? [];
	const summary = summaryQuery.data;

	const handleSave = async (price: RegionPrice) => {
		const numPrice = Number.parseFloat(editPrice);
		if (Number.isNaN(numPrice) || numPrice < 0) {
			showStudioErrorToast(new Error("Invalid price"));
			return;
		}

		try {
			await setPriceMutation.mutateAsync({
				product_id: price.product_id,
				country_code: price.country_code,
				price_usd: numPrice,
				note: editNote,
			});
			setEditingId(null);
		} catch (e) {
			showStudioErrorToast(e);
		}
	};

	const handleAdd = async () => {
		const numPrice = Number.parseFloat(newPrice);
		if (!newProductId || Number.isNaN(numPrice) || numPrice < 0) {
			showStudioErrorToast(new Error("Product and valid price required"));
			return;
		}

		try {
			await setPriceMutation.mutateAsync({
				product_id: newProductId,
				country_code: newCountry,
				price_usd: numPrice,
				note: newNote,
			});
			setShowAddForm(false);
			setNewProductId("");
			setNewPrice("");
			setNewNote("");
		} catch (e) {
			showStudioErrorToast(e);
		}
	};

	const handleDelete = async (price: RegionPrice) => {
		try {
			await deletePriceMutation.mutateAsync({
				product_id: price.product_id,
				country_code: price.country_code,
			});
		} catch (e) {
			showStudioErrorToast(e);
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold">Region-Specific Pricing</h2>
					<p className="text-sm text-muted-foreground">
						Set different prices for products in different countries.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							void pricesQuery.refetch();
							void summaryQuery.refetch();
						}}
						disabled={pricesQuery.isFetching}
					>
						<ArrowPathIcon className="size-4 mr-1.5" />
						Refresh
					</Button>
					<Button
						size="sm"
						onClick={() => setShowAddForm(!showAddForm)}
						className="bg-emerald-600 hover:bg-emerald-700 text-white"
					>
						<PlusIcon className="size-4 mr-1.5" />
						Add Price
					</Button>
				</div>
			</div>

			{/* Summary cards */}
			{summary && (
				<div className="grid grid-cols-3 gap-4">
					<div className="rounded-lg border bg-muted/30 p-3">
						<div className="text-xs text-muted-foreground">Total Overrides</div>
						<div className="text-2xl font-bold">{summary.total_overrides}</div>
					</div>
					<div className="rounded-lg border bg-muted/30 p-3">
						<div className="text-xs text-muted-foreground">
							Products with Overrides
						</div>
						<div className="text-2xl font-bold">
							{summary.products_with_overrides}
						</div>
					</div>
					<div className="rounded-lg border bg-muted/30 p-3">
						<div className="text-xs text-muted-foreground">
							Countries with Overrides
						</div>
						<div className="text-2xl font-bold">
							{summary.countries_with_overrides}
						</div>
					</div>
				</div>
			)}

			{/* Add form */}
			{showAddForm && (
				<div className="rounded-lg border bg-muted/30 p-4 space-y-3">
					<h3 className="text-sm font-medium">Add Region Price</h3>
					<div className="grid grid-cols-4 gap-3">
						<div>
							<label
								htmlFor="new-product"
								className="text-xs text-muted-foreground"
							>
								Product
							</label>
							<select
								value={newProductId}
								onChange={(e) => setNewProductId(e.target.value)}
								className="w-full rounded-md border bg-background px-3 py-2 text-sm"
							>
								<option value="">Select product...</option>
								{products
									.filter((p) => p.paid)
									.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name} (${p.price_usd})
										</option>
									))}
							</select>
						</div>
						<div>
							<label
								htmlFor="new-country"
								className="text-xs text-muted-foreground"
							>
								Country
							</label>
							<select
								value={newCountry}
								onChange={(e) => setNewCountry(e.target.value)}
								className="w-full rounded-md border bg-background px-3 py-2 text-sm"
							>
								{Object.entries(COUNTRIES).map(([code, name]) => (
									<option key={code} value={code}>
										{code} — {name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label
								htmlFor="new-price"
								className="text-xs text-muted-foreground"
							>
								Price (USD)
							</label>
							<input
								id="new-price"
								type="number"
								value={newPrice}
								onChange={(e) => setNewPrice(e.target.value)}
								placeholder="0.00"
								min="0"
								step="0.01"
								className="w-full rounded-md border bg-background px-3 py-2 text-sm"
							/>
						</div>
						<div>
							<label
								htmlFor="new-note"
								className="text-xs text-muted-foreground"
							>
								Note
							</label>
							<input
								type="text"
								value={newNote}
								onChange={(e) => setNewNote(e.target.value)}
								placeholder="Optional note"
								className="w-full rounded-md border bg-background px-3 py-2 text-sm"
							/>
						</div>
					</div>
					<div className="flex gap-2">
						<Button
							size="sm"
							onClick={() => void handleAdd()}
							disabled={setPriceMutation.isPending}
							className="bg-emerald-600 hover:bg-emerald-700 text-white"
						>
							{setPriceMutation.isPending ? (
								<Spinner size="xs" className="mr-1.5" />
							) : (
								<CurrencyDollarIcon className="size-4 mr-1.5" />
							)}
							Save
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setShowAddForm(false)}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}

			{/* Prices table */}
			<div className="rounded-lg border overflow-hidden">
				<table className="w-full text-sm">
					<thead>
						<tr className="bg-muted/50 border-b">
							<th className="text-left px-4 py-2 font-medium">Product</th>
							<th className="text-left px-4 py-2 font-medium">Country</th>
							<th className="text-right px-4 py-2 font-medium">Price (USD)</th>
							<th className="text-left px-4 py-2 font-medium">Note</th>
							<th className="text-right px-4 py-2 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{pricesQuery.isFetching && prices.length === 0 ? (
							<tr>
								<td colSpan={5} className="px-4 py-8 text-center">
									<Spinner size="sm" className="mr-2" />
									Loading...
								</td>
							</tr>
						) : prices.length === 0 ? (
							<tr>
								<td
									colSpan={5}
									className="px-4 py-8 text-center text-muted-foreground"
								>
									No region-specific prices set. Click "Add Price" to create
									one.
								</td>
							</tr>
						) : (
							prices.map((price) => {
								const rowId = `${price.product_id}:${price.country_code}`;
								const isEditing = editingId === rowId;
								const productName =
									products.find((p) => p.id === price.product_id)?.name ??
									price.product_id;
								const countryName =
									COUNTRIES[price.country_code] ?? price.country_code;

								return (
									<tr key={rowId} className="border-b last:border-0">
										<td className="px-4 py-2">
											<span className="font-medium">{productName}</span>
										</td>
										<td className="px-4 py-2">
											<span className="text-muted-foreground">
												{price.country_code}
											</span>{" "}
											{countryName}
										</td>
										<td className="px-4 py-2 text-right">
											{isEditing ? (
												<input
													type="number"
													value={editPrice}
													onChange={(e) => setEditPrice(e.target.value)}
													className="w-24 rounded border bg-background px-2 py-1 text-right text-sm"
													min="0"
													step="0.01"
												/>
											) : (
												<span className="font-mono">
													${price.price_usd.toFixed(2)}
												</span>
											)}
										</td>
										<td className="px-4 py-2 text-muted-foreground text-xs">
											{isEditing ? (
												<input
													type="text"
													value={editNote}
													onChange={(e) => setEditNote(e.target.value)}
													className="w-full rounded border bg-background px-2 py-1 text-sm"
													placeholder="Note"
												/>
											) : (
												price.note || "—"
											)}
										</td>
										<td className="px-4 py-2 text-right">
											{isEditing ? (
												<div className="flex gap-1 justify-end">
													<Button
														size="sm"
														onClick={() => void handleSave(price)}
														disabled={setPriceMutation.isPending}
													>
														Save
													</Button>
													<Button
														size="sm"
														variant="ghost"
														onClick={() => setEditingId(null)}
													>
														Cancel
													</Button>
												</div>
											) : (
												<div className="flex gap-1 justify-end">
													<Button
														size="sm"
														variant="ghost"
														onClick={() => {
															setEditingId(rowId);
															setEditPrice(price.price_usd.toString());
															setEditNote(price.note);
														}}
													>
														Edit
													</Button>
													<Button
														size="sm"
														variant="ghost"
														onClick={() => void handleDelete(price)}
														className="text-destructive"
													>
														<TrashIcon className="size-3.5" />
													</Button>
												</div>
											)}
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
