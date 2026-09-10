import { CpuChipIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useServerHealth } from "@/lib/hooks/useServer";
import { useServerStore } from "@/stores/serverStore";
import { Badge } from "@/ui/primitives";
import { Progress } from "@/ui/progress";
import { ScreenHeader } from "@/ui/states";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "@/ui/table";

function ago(a: number | null, b: number | null): string {
	if (b != null) {
		if (b < 60) {
			return `${Math.round(b)}s ago`;
		}
		if (b < 3600) {
			return `${Math.round(b / 60)}m ago`;
		}
		return `${Math.round(b / 3600)}h ago`;
	}
	if (a == null) {
		return "never";
	}
	return new Date(a * 1000).toLocaleTimeString();
}

function Gate({ ok, label }: { ok?: boolean; label: string }) {
	return (
		<Badge tone={ok == null ? "neutral" : ok ? "success" : "danger"}>
			{label}: {ok == null ? "…" : ok ? "ok" : "fail"}
		</Badge>
	);
}

/**
 * System: VRAM usage, repo gate status, per-engine lifecycle table
 * (loaded, last used, keepalive, flags). Polls while visible.
 */
export function ModelHealthPage() {
	const { data: h } = useServerHealth();
	const url = useServerStore((s) => s.serverUrl);
	const { data: m, isLoading } = useQuery({
		queryKey: ["health", "models", url],
		queryFn: () => apiClient.getHealthModels(),
		refetchInterval: 10000,
		retry: 1,
	});
	const { data: g } = useQuery({
		queryKey: ["health", "check", url],
		queryFn: () => apiClient.getHealthCheck(),
		refetchInterval: 60000,
		retry: 1,
	});

	const used = h?.vram_used_mb;
	const total = h?.vram_total_mb;
	const pct =
		used != null && total != null && total > 0
			? Math.round((used / total) * 100)
			: 0;
	const label =
		used != null && total != null
			? `${used.toFixed(0)}/${total.toFixed(0)} MB`
			: used != null
				? `${used.toFixed(0)} MB`
				: "unknown";

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<ScreenHeader
				title="System"
			/>
			<section className="rounded-md border border-border bg-card p-4">
				<div className="flex items-center justify-between">
					<span className="flex items-center gap-2 text-sm font-medium text-foreground">
						<CpuChipIcon
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						VRAM
					</span>
					<span className="text-xs tabular-nums text-muted-foreground">
						{label}
					</span>
				</div>
				<Progress value={pct} label="VRAM usage" className="mt-3 h-2" />
				<p className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
					<span className="tabular-nums">{pct}% used</span>
					{h?.vram_pressure != null ? (
						<span className={h.vram_pressure ? "text-danger-text" : ""}>
							{h.vram_pressure ? "pressure" : "ok"}
						</span>
					) : null}
				</p>
			</section>

			<section className="rounded-md border border-border bg-card p-4">
				<h3 className="text-sm font-medium text-foreground">Gate status</h3>
				<div className="mt-2 flex flex-wrap gap-2">
					<Gate ok={g?.name_map.ok} label="name_map" />
					<Gate ok={g?.placeholders.ok} label="placeholders" />
					<Gate ok={g?.biome.ok} label="biome" />
					<Gate ok={g?.ruff.ok} label="ruff" />
					<Gate ok={g?.tsc.ok} label="tsc" />
				</div>
				{g?.cached_at ? (
					<p className="mt-2 text-xs text-muted-foreground">
						cached {new Date(g.cached_at * 1000).toLocaleTimeString()}
					</p>
				) : null}
			</section>

			<section>
				<h3 className="mb-2 text-sm font-medium text-foreground">
					Engines ({m?.engines.length ?? 0})
				</h3>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					<Table>
						<TableHead>
							<tr>
								<TableHeaderCell>Engine</TableHeaderCell>
								<TableHeaderCell>Loaded</TableHeaderCell>
								<TableHeaderCell>Last used</TableHeaderCell>
								<TableHeaderCell>Keepalive</TableHeaderCell>
								<TableHeaderCell>Flags</TableHeaderCell>
							</tr>
						</TableHead>
						<TableBody>
							{(m?.engines ?? []).map((e) => (
								<TableRow key={e.engine}>
									<TableCell className="font-mono text-xs">
										{e.engine}
									</TableCell>
									<TableCell>
										<Badge tone={e.is_loaded ? "success" : "neutral"}>
											{e.is_loaded ? "yes" : "no"}
										</Badge>
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{ago(e.last_used, e.last_used_ago)}
									</TableCell>
									<TableCell>
										{e.per_engine_keepalive != null ? (
											<Badge
												tone={e.per_engine_keepalive ? "success" : "neutral"}
											>
												{e.per_engine_keepalive ? "on" : "off"}
											</Badge>
										) : e.always_on ? (
											<Badge tone="accent">always</Badge>
										) : (
											<span className="text-xs text-muted-foreground">
												follow global
											</span>
										)}
									</TableCell>
									<TableCell>
										<span className="flex flex-wrap gap-1">
											{e.gpu_only ? (
												<Badge
													tone="danger"
													title="Requires GPU — disabled on CPU"
												>
													GPU
												</Badge>
											) : null}
											{e.needs_trim ? (
												<Badge tone="neutral" title="Output needs trim">
													trim
												</Badge>
											) : null}
										</span>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</section>
		</div>
	);
}
