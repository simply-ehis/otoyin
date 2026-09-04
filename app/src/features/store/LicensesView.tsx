import { KeyIcon } from "@heroicons/react/24/outline";
import type { LicenseRecord } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/ui/primitives";

interface Props {
	isLoading: boolean;
	licenses: LicenseRecord[] | undefined;
	entitlements: string[] | undefined;
}

/** My Licenses view: installed license records + active entitlements. */
export function LicensesView({ isLoading, licenses, entitlements }: Props) {
	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-16">
				<Skeleton className="h-8 w-48" />
			</div>
		);
	}
	if (!licenses || licenses.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
				<KeyIcon className="mb-2 size-10 text-muted-foreground/20" />
				<p className="text-sm text-muted-foreground">
					No licenses installed yet
				</p>
				<p className="mt-1 text-xs text-muted-foreground/60">
					Buy a premium model to get a license, or paste a license JSON in the
					product detail.
				</p>
			</div>
		);
	}
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				{licenses.map((lic) => (
					<div
						key={lic.product_id}
						className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="truncate text-sm font-medium text-foreground">
									{lic.name}
								</span>
								<span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
									{lic.type}
								</span>
								<span
									className={cn(
										"text-xs font-semibold",
										lic.status === "active"
											? "text-success-text"
											: "text-warning-text",
									)}
								>
									{lic.status}
								</span>
							</div>
							{lic.expires_at && (
								<span className="text-xs text-muted-foreground">
									Expires {new Date(lic.expires_at).toLocaleDateString()}
								</span>
							)}
						</div>
					</div>
				))}
			</div>
			{entitlements && entitlements.length > 0 && (
				<div>
					<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Active Entitlements
					</h3>
					<div className="flex flex-wrap gap-2">
						{entitlements.map((ent) => (
							<span
								key={ent}
								className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground"
							>
								{ent}
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
