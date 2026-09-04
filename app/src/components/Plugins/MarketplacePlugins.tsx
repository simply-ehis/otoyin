import {
	ArrowUpTrayIcon as ArrowUpTray,
	PlayIcon as Play,
	PowerIcon as Power,
	ShieldCheckIcon as ShieldCheck,
	StopIcon as Stop,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { MarketplacePlugin } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

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

	const installMut = useMutation({
		mutationFn: (file: File) => apiClient.installMarketplacePlugin(file),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["marketplace-plugins"] });
			toast({ title: "Plugin installed (disabled by default)" });
		},
		onError: (e: Error) =>
			toast({
				title: "Install failed",
				description: e.message,
				variant: "destructive",
			}),
	});

	const toggleMut = useMutation({
		mutationFn: (p: MarketplacePlugin) =>
			p.enabled
				? apiClient.disableMarketplacePlugin(p.plugin_id)
				: apiClient.enableMarketplacePlugin(p.plugin_id),
		onMutate: (p) => setBusyId(p.plugin_id),
		onSettled: () => setBusyId(null),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["marketplace-plugins"] }),
		onError: (e: Error) =>
			toast({
				title: "Action failed",
				description: e.message,
				variant: "destructive",
			}),
	});

	const approveMut = useMutation({
		mutationFn: (id: string) => apiClient.approveExternalPlugin(id),
		onMutate: (id) => setBusyId(id),
		onSettled: () => setBusyId(null),
		onSuccess: (res) => {
			setRunning((r) => ({ ...r, [res.plugin_id]: false }));
			queryClient.invalidateQueries({ queryKey: ["marketplace-plugins"] });
			toast({ title: "External app approved and enabled" });
		},
		onError: (e: Error) =>
			toast({
				title: "Approval failed",
				description: e.message,
				variant: "destructive",
			}),
	});

	const launchMut = useMutation({
		mutationFn: (id: string) => apiClient.launchExternalPlugin(id),
		onSuccess: (res) => {
			setRunning((r) => ({ ...r, [res.plugin_id]: true }));
			toast({ title: `Launched ${res.plugin_id}` });
		},
		onError: (e: Error) =>
			toast({
				title: "Launch failed",
				description: e.message,
				variant: "destructive",
			}),
	});

	const stopMut = useMutation({
		mutationFn: (id: string) => apiClient.stopPlugin(id),
		onSuccess: (res) => {
			setRunning((r) => ({ ...r, [res.plugin_id]: false }));
		},
		onError: (e: Error) =>
			toast({
				title: "Stop failed",
				description: e.message,
				variant: "destructive",
			}),
	});

	const uninstallMut = useMutation({
		mutationFn: (id: string) => apiClient.uninstallMarketplacePlugin(id),
		onMutate: (id) => setBusyId(id),
		onSettled: () => setBusyId(null),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["marketplace-plugins"] }),
		onError: (e: Error) =>
			toast({
				title: "Uninstall failed",
				description: e.message,
				variant: "destructive",
			}),
	});

	const plugins: MarketplacePlugin[] =
		(pluginsQuery.data as MarketplacePlugin[]) ?? [];

	return (
		<div className="flex flex-col h-full p-4 gap-3">
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">
					Install offline <code className="text-xs">.Otoyin</code> bundles.
					Plugins install disabled and never run until you enable them.
				</span>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						className="h-7 text-xs"
						onClick={() => fileRef.current?.click()}
						disabled={installMut.isPending}
					>
						<ArrowUpTray className="h-3.5 w-3.5 mr-1" /> Install bundle
					</Button>
					<input
						ref={fileRef}
						type="file"
						accept=".Otoyin,.zip"
						className="hidden"
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) {
								installMut.mutate(f);
							}
							e.target.value = "";
						}}
					/>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto space-y-2">
				{pluginsQuery.isLoading ? (
					<div className="flex items-center justify-center py-16 text-muted-foreground">
						<Spinner size="sm" />
					</div>
				) : plugins.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
						<ArrowUpTray className="size-10 mb-2 opacity-30" />
						<p className="text-xs">No installed marketplace plugins</p>
						<p className="text-xs opacity-60 mt-1">
							Install a signed .Otoyin bundle to get started
						</p>
					</div>
				) : (
					plugins.map((p) => {
						const isExternal = p.kind === "external-app";
						const isRunning = running[p.plugin_id] === true;
						return (
							<div
								key={p.plugin_id}
								className="border border-border rounded-lg bg-card px-3 py-2"
							>
								<div className="flex items-center gap-2">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="text-xs font-medium text-foreground truncate">
												{p.name}
											</span>
											<Badge variant="secondary" className="text-[8px]">
												{p.kind ?? "unknown"}
											</Badge>
											{p.verified ? (
												<Badge
													variant="outline"
													className="text-[8px] text-emerald-500 border-emerald-500/40"
												>
													<ShieldCheck className="size-3 mr-0.5" /> Verified
												</Badge>
											) : (
												<Badge
													variant="outline"
													className="text-[8px] text-amber-500 border-amber-500/40"
												>
													Unverified
												</Badge>
											)}
											{!p.enabled && (
												<Badge variant="outline" className="text-[8px]">
													Disabled
												</Badge>
											)}
										</div>
										<span className="text-xs text-muted-foreground">
											{p.developer ?? "unknown"} · v{p.version}
										</span>
									</div>
									<div className="flex items-center gap-1 shrink-0">
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
												className={cn(
													"p-1.5 rounded transition-colors",
													isRunning
														? "text-destructive"
														: "text-accent hover:text-foreground",
												)}
												disabled={!p.enabled || busyId === p.plugin_id}
												onClick={() =>
													isRunning
														? stopMut.mutate(p.plugin_id)
														: launchMut.mutate(p.plugin_id)
												}
											>
												{isRunning ? (
													<Stop className="size-3.5" />
												) : (
													<Play className="size-3.5" />
												)}
											</button>
										) : null}
										{!isExternal || p.trust_external ? (
											<button
												type="button"
												title={p.enabled ? "Disable plugin" : "Enable plugin"}
												aria-label={
													p.enabled ? "Disable plugin" : "Enable plugin"
												}
												className={cn(
													"p-1.5 rounded transition-colors",
													p.enabled
														? "text-accent"
														: "text-muted-foreground/40 hover:text-foreground",
												)}
												disabled={
													busyId === p.plugin_id ||
													(isExternal && !p.trust_external)
												}
												onClick={() => toggleMut.mutate(p)}
											>
												{busyId === p.plugin_id ? (
													<Spinner size="sm" />
												) : (
													<Power className="size-3.5" />
												)}
											</button>
										) : null}
										<button
											type="button"
											title="Uninstall plugin"
											aria-label="Uninstall plugin"
											className="text-destructive/60 hover:text-destructive p-1.5 rounded transition-colors"
											disabled={busyId === p.plugin_id}
											onClick={() => uninstallMut.mutate(p.plugin_id)}
										>
											<Trash2 className="size-3.5" />
										</button>
									</div>
								</div>
								{isExternal && p.external_command && (
									<div className="mt-1.5">
										<Badge
											variant="outline"
											className="text-[8px] text-amber-500 border-amber-500/40 font-mono"
										>
											launches: {p.external_command}
										</Badge>
									</div>
								)}
								{p.permissions.length > 0 && (
									<div className="flex flex-wrap gap-1 mt-1.5">
										{p.permissions.map((perm) => (
											<Badge
												key={perm}
												variant="outline"
												className="text-[8px] text-muted-foreground"
											>
												{perm}
											</Badge>
										))}
									</div>
								)}
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}
