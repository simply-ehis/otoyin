import {
	ArrowUpTrayIcon,
	PlayIcon,
	PowerIcon,
	ShieldCheckIcon,
	StopIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { MarketplacePlugin } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Badge, Spinner } from "@/ui/primitives";
import { EmptyState } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

/**
 * Offline plugin bundles: install signed .otoyin files (disabled by
 * default), enable/disable, approve + launch external apps, uninstall.
 * Nothing runs until explicitly enabled.
 */
export function MarketplacePlugins() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const fileRef = useRef<HTMLInputElement>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [running, setRunning] = useState<Record<string, boolean>>({});

	const pluginsQuery = useQuery({
		queryKey: ["marketplace-plugins"],
		queryFn: () => apiClient.listMarketplacePlugins(),
	});

	const fail = (title: string) => (e: Error) =>
		toast({ title, description: e.message, variant: "destructive" });

	const installMut = useMutation({
		mutationFn: (file: File) => apiClient.installMarketplacePlugin(file),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["marketplace-plugins"] });
			toast({ title: "Plugin installed (disabled by default)" });
		},
		onError: fail("Install failed"),
	});
	const toggleMut = useMutation({
		mutationFn: (p: MarketplacePlugin) =>
			p.enabled
				? apiClient.disableMarketplacePlugin(p.plugin_id)
				: apiClient.enableMarketplacePlugin(p.plugin_id),
		onMutate: (p) => setBusyId(p.plugin_id),
		onSettled: () => setBusyId(null),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: ["marketplace-plugins"] }),
		onError: fail("Action failed"),
	});
	const approveMut = useMutation({
		mutationFn: (id: string) => apiClient.approveExternalPlugin(id),
		onMutate: (id) => setBusyId(id),
		onSettled: () => setBusyId(null),
		onSuccess: (res) => {
			setRunning((r) => ({ ...r, [res.plugin_id]: false }));
			void queryClient.invalidateQueries({ queryKey: ["marketplace-plugins"] });
			toast({ title: "External app approved and enabled" });
		},
		onError: fail("Approval failed"),
	});
	const launchMut = useMutation({
		mutationFn: (id: string) => apiClient.launchExternalPlugin(id),
		onSuccess: (res) => {
			setRunning((r) => ({ ...r, [res.plugin_id]: true }));
			toast({ title: `Launched ${res.plugin_id}` });
		},
		onError: fail("Launch failed"),
	});
	const stopMut = useMutation({
		mutationFn: (id: string) => apiClient.stopPlugin(id),
		onSuccess: (res) => setRunning((r) => ({ ...r, [res.plugin_id]: false })),
		onError: fail("Stop failed"),
	});
	const uninstallMut = useMutation({
		mutationFn: (id: string) => apiClient.uninstallMarketplacePlugin(id),
		onMutate: (id) => setBusyId(id),
		onSettled: () => setBusyId(null),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: ["marketplace-plugins"] }),
		onError: fail("Uninstall failed"),
	});

	const plugins: MarketplacePlugin[] = pluginsQuery.data ?? [];

	return (
		<div className="flex h-full flex-col gap-3 p-4">
			<div className="flex items-center justify-between gap-3">
				<p className="text-xs text-muted-foreground">
					Install offline{" "}
					<code className="font-mono text-foreground">.otoyin</code> bundles.
					Plugins install disabled and never run until you enable them.
				</p>
				<span className="flex shrink-0 items-center gap-2">
					<Button
						size="sm"
						className="h-7 text-xs"
						onClick={() => fileRef.current?.click()}
						disabled={installMut.isPending}
					>
						<ArrowUpTrayIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
						Install bundle
					</Button>
					<input
						ref={fileRef}
						type="file"
						accept=".otoyin,.zip"
						className="hidden"
						aria-label="Plugin bundle file"
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) {
								installMut.mutate(f);
							}
							e.target.value = "";
						}}
					/>
				</span>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{pluginsQuery.isLoading ? (
					<output
						className="flex items-center justify-center py-16"
						aria-label="Loading plugins"
					>
						<Spinner size="sm" />
					</output>
				) : plugins.length === 0 ? (
					<EmptyState
						icon={<ArrowUpTrayIcon aria-hidden="true" />}
						title="No installed marketplace plugins"
						body="Install a signed .otoyin bundle to get started."
					/>
				) : (
					<ul className="flex flex-col gap-2">
						{plugins.map((p) => {
							const isExternal = p.kind === "external-app";
							const isRunning = running[p.plugin_id] === true;
							return (
								<li
									key={p.plugin_id}
									className="rounded-md border border-border bg-card px-3 py-2"
								>
									<div className="flex items-center gap-2">
										<div className="min-w-0 flex-1">
											<p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
												<span className="truncate">{p.name}</span>
												<Badge tone="neutral">{p.kind ?? "unknown"}</Badge>
												{p.verified ? (
													<Badge tone="success">
														<ShieldCheckIcon
															className="mr-0.5 size-3"
															aria-hidden="true"
														/>
														Verified
													</Badge>
												) : (
													<Badge tone="warning">Unverified</Badge>
												)}
												{!p.enabled ? (
													<Badge tone="neutral">Disabled</Badge>
												) : null}
											</p>
											<p className="truncate text-xs text-muted-foreground">
												{p.developer ?? "unknown"} · v{p.version}
											</p>
										</div>
										<span className="flex shrink-0 items-center gap-1">
											{isExternal && !p.trust_external ? (
												<Button
													size="sm"
													className="h-6 text-xs"
													disabled={busyId === p.plugin_id}
													title={`Approves launching: ${p.external_command ?? ""}`}
													onClick={() => approveMut.mutate(p.plugin_id)}
												>
													Approve &amp; Enable
												</Button>
											) : isExternal ? (
												<button
													type="button"
													title={
														isRunning
															? "Stop external app"
															: "Launch external app"
													}
													aria-label={
														isRunning
															? "Stop external app"
															: "Launch external app"
													}
													disabled={!p.enabled || busyId === p.plugin_id}
													onClick={() =>
														isRunning
															? stopMut.mutate(p.plugin_id)
															: launchMut.mutate(p.plugin_id)
													}
													className={cn(
														"rounded-sm p-1.5 transition-colors disabled:opacity-40",
														isRunning
															? "text-destructive"
															: "text-accent hover:text-foreground",
													)}
												>
													{isRunning ? (
														<StopIcon className="size-3.5" aria-hidden="true" />
													) : (
														<PlayIcon className="size-3.5" aria-hidden="true" />
													)}
												</button>
											) : null}
											{(!isExternal || p.trust_external) &&
											!(isExternal && !p.trust_external) ? (
												<button
													type="button"
													title={p.enabled ? "Disable plugin" : "Enable plugin"}
													aria-label={
														p.enabled ? "Disable plugin" : "Enable plugin"
													}
													disabled={
														busyId === p.plugin_id ||
														(isExternal && !p.trust_external)
													}
													onClick={() => toggleMut.mutate(p)}
													className={cn(
														"rounded-sm p-1.5 transition-colors disabled:opacity-40",
														p.enabled
															? "text-accent"
															: "text-muted-foreground/60 hover:text-foreground",
													)}
												>
													{busyId === p.plugin_id ? (
														<Spinner size="sm" />
													) : (
														<PowerIcon
															className="size-3.5"
															aria-hidden="true"
														/>
													)}
												</button>
											) : null}
											<button
												type="button"
												title="Uninstall plugin"
												aria-label={`Uninstall ${p.name}`}
												disabled={busyId === p.plugin_id}
												onClick={() => uninstallMut.mutate(p.plugin_id)}
												className="rounded-sm p-1.5 text-destructive/70 transition-colors hover:text-destructive disabled:opacity-40"
											>
												<TrashIcon className="size-3.5" aria-hidden="true" />
											</button>
										</span>
									</div>
									{isExternal && p.external_command ? (
										<p className="mt-1.5">
											<Badge tone="warning" className="font-mono">
												launches: {p.external_command}
											</Badge>
										</p>
									) : null}
									{p.permissions.length > 0 ? (
										<ul className="mt-1.5 flex flex-wrap gap-1">
											{p.permissions.map((perm) => (
												<li key={perm}>
													<Badge tone="neutral">{perm}</Badge>
												</li>
											))}
										</ul>
									) : null}
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
