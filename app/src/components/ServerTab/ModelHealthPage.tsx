import { CpuChipIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api/client";
import { useServerHealth } from "@/lib/hooks/useServer";
import { useServerStore } from "@/stores/serverStore";

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
function Gate({ o, l }: { o?: boolean; l: string }) {
	return (
		<Badge variant={o ? "secondary" : o === false ? "destructive" : "outline"}>
			{l}: {o == null ? "…" : o ? "ok" : "fail"}
		</Badge>
	);
}
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
		<div className="space-y-6 max-w-3xl">
			<div>
				<h2 className="text-lg font-semibold">System</h2>
				<p className="text-sm text-muted-foreground">
					Model health, VRAM, and gate status.
				</p>
			</div>
			<div className="rounded-lg border border-border/60 p-4 space-y-3">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium flex items-center gap-2">
						<CpuChipIcon className="size-4" /> VRAM
					</span>
					<span className="text-xs text-muted-foreground">{label}</span>
				</div>
				<Progress value={pct} className="h-2" />
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>{pct}% used</span>
					{h?.vram_pressure != null && (
						<span className={h.vram_pressure ? "text-destructive" : ""}>
							{h.vram_pressure ? "pressure" : "ok"}
						</span>
					)}
				</div>
			</div>
			<div className="rounded-lg border border-border/60 p-4 space-y-2">
				<h3 className="text-sm font-medium">Gate status</h3>
				<div className="flex flex-wrap gap-2">
					<Gate o={g?.name_map.ok} l="name_map" />
					<Gate o={g?.placeholders.ok} l="placeholders" />
					<Gate o={g?.biome.ok} l="biome" />
					<Gate o={g?.ruff.ok} l="ruff" />
					<Gate o={g?.tsc.ok} l="tsc" />
				</div>
				{g?.cached_at && (
					<p className="text-xs text-muted-foreground">
						cached {new Date(g.cached_at * 1000).toLocaleTimeString()}
					</p>
				)}
			</div>
			<div className="rounded-lg border border-border/60 overflow-hidden">
				<div className="px-4 py-3 border-b border-border/60">
					<h3 className="text-sm font-medium">
						Engines ({m?.engines.length ?? 0})
					</h3>
				</div>
				{isLoading ? (
					<p className="p-4 text-sm text-muted-foreground">Loading...</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="text-xs text-muted-foreground border-b border-border/60">
								<tr>
									<th className="text-left px-3 py-2 font-medium">Engine</th>
									<th className="text-left px-3 py-2 font-medium">Loaded</th>
									<th className="text-left px-3 py-2 font-medium">Last used</th>
									<th className="text-left px-3 py-2 font-medium">Keepalive</th>
									<th className="text-left px-3 py-2 font-medium">Flags</th>
								</tr>
							</thead>
							<tbody>
								{(m?.engines ?? []).map((e) => (
									<tr
										key={e.engine}
										className="border-b border-border/40 last:border-0"
									>
										<td className="px-3 py-2 font-mono text-xs">{e.engine}</td>
										<td className="px-3 py-2">
											<Badge variant={e.is_loaded ? "default" : "outline"}>
												{e.is_loaded ? "yes" : "no"}
											</Badge>
										</td>
										<td className="px-3 py-2 text-xs text-muted-foreground">
											{ago(e.last_used, e.last_used_ago)}
										</td>
										<td className="px-3 py-2">
											{e.per_engine_keepalive != null ? (
												<Badge
													variant={
														e.per_engine_keepalive ? "default" : "secondary"
													}
												>
													{e.per_engine_keepalive ? "on" : "off"}
												</Badge>
											) : e.always_on ? (
												<Badge variant="secondary">always</Badge>
											) : (
												<span className="text-xs text-muted-foreground">
													follow global
												</span>
											)}
										</td>
										<td className="px-3 py-2 flex flex-wrap gap-1">
											{e.gpu_only && (
												<Badge
													variant="destructive"
													title="Requires GPU — disabled on CPU"
												>
													GPU
												</Badge>
											)}
											{e.needs_trim && (
												<Badge variant="secondary" title="Output needs trim">
													trim
												</Badge>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
