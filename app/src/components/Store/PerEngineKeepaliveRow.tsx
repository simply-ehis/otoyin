import { useMemo } from "react";
import { Toggle } from "@/components/ui/toggle";
import type { ModelStatus } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { usePerformanceSettings } from "@/lib/hooks/useSettings";

export function PerEngineKeepaliveRow({
	models,
}: {
	models: ModelStatus[] | undefined;
}) {
	const { settings: perfSettings, update: updatePerf } =
		usePerformanceSettings();

	const candidates = useMemo(() => {
		const seen = new Map<string, ModelStatus>();
		for (const m of models ?? []) {
			if (!m.downloaded) {
				continue;
			}
			if (m.size_mb == null || m.size_mb <= 500) {
				continue;
			}
			const key = m.engine ?? m.model_name;
			if (!key) {
				continue;
			}
			if (!seen.has(key)) {
				seen.set(key, m);
			}
		}
		return Array.from(seen.entries());
	}, [models]);

	if (candidates.length === 0) {
		return null;
	}

	const globalMode = perfSettings?.performance_mode ?? false;
	const overrides = perfSettings?.per_engine_keepalive ?? {};

	return (
		<section className="rounded-lg border bg-card p-3 space-y-2">
			<div>
				<h3 className="text-xs font-semibold">Keepalive — large models</h3>
				<p className="text-xs text-muted-foreground">
					Keep heavy engines resident and skip idle unload. Overrides global
					Performance Mode.
				</p>
			</div>
			<div className="space-y-1.5">
				{candidates.map(([engine, m]) => {
					const effective = overrides[engine] ?? globalMode;
					return (
						<div
							key={engine}
							className="flex items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 hover:bg-muted/50"
						>
							<span className="min-w-0 flex-1">
								<span className="text-xs font-medium">{engine}</span>
								<span className="ml-2 text-xs text-muted-foreground">
									{m.display_name} · {m.size_mb?.toFixed(0)} MB
								</span>
							</span>
							<Toggle
								checked={effective}
								label={`Keep ${engine} loaded`}
								onCheckedChange={(checked: boolean) => {
									const next = { ...overrides, [engine]: checked };
									type MutOpts = { onError?: (err: unknown) => void };
									(
										updatePerf as unknown as (
											patch: { per_engine_keepalive: Record<string, boolean> },
											opts?: MutOpts,
										) => void
									)(
										{ per_engine_keepalive: next },
										{ onError: (err: unknown) => showStudioErrorToast(err) },
									);
								}}
							/>
						</div>
					);
				})}
			</div>
		</section>
	);
}
