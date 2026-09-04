import {
	ChevronDownIcon as ChevronDown,
	ChevronRightIcon as ChevronRight,
	WifiIcon as Plug,
	PlusIcon as Plus,
	PowerIcon as Power,
	ArrowPathIcon as RefreshCw,
	MagnifyingGlassIcon as Search,
	SpeakerWaveIcon as Speaker,
	TrashIcon as Trash2,
	WrenchIcon as Wrench,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/Spinner";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { MarketplacePlugins } from "./MarketplacePlugins";

interface PluginParam {
	min: number;
	max: number;
	default: number;
	unit: string;
}

interface PluginInfo {
	id: string;
	name: string;
	vendor: string;
	category: string;
	version: string;
	type: string;
	enabled: boolean;
	is_builtin: boolean;
	params: Record<string, PluginParam>;
	description: string;
}

interface ChainItem {
	_key: string;
	plugin: PluginInfo;
	enabled: boolean;
	params: Record<string, number>;
}

let chainKeyCounter = 0;
function nextKey(): string {
	return `ci-${++chainKeyCounter}`;
}

export function PluginsPage() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [searchQuery, setSearchQuery] = useState("");
	const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
	const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
	const [chain, setChain] = useState<ChainItem[]>([]);
	const [expandedChainItem, setExpandedChainItem] = useState<string | null>(
		null,
	);
	const [view, setView] = useState<"audio" | "marketplace">("audio");

	const pluginsQuery = useQuery({
		queryKey: ["plugins"],
		queryFn: () => apiClient.listPlugins(),
	});

	const statusQuery = useQuery({
		queryKey: ["plugin-status"],
		queryFn: () => apiClient.getPluginStatus(),
	});

	const scanMut = useMutation({
		mutationFn: () => apiClient.scanPlugins(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["plugins"] });
			queryClient.invalidateQueries({ queryKey: ["plugin-status"] });
			toast({ title: "Plugin scan complete" });
		},
		onError: (e: Error) =>
			toast({
				title: "Scan failed",
				description: e.message,
				variant: "destructive",
			}),
	});

	const rawPlugins: PluginInfo[] = (pluginsQuery.data as PluginInfo[]) ?? [];

	const filteredPlugins = rawPlugins.filter((p) => {
		if (categoryFilter && p.category !== categoryFilter) {
			return false;
		}
		if (
			searchQuery &&
			!p.name.toLowerCase().includes(searchQuery.toLowerCase())
		) {
			return false;
		}
		return true;
	});

	const categories = [...new Set(rawPlugins.map((p) => p.category))];

	const addToChain = (plugin: PluginInfo) => {
		const defaults: Record<string, number> = {};
		for (const [key, param] of Object.entries(plugin.params)) {
			defaults[key] = param.default;
		}
		setChain((prev) => [
			...prev,
			{ _key: nextKey(), plugin, enabled: true, params: defaults },
		]);
		setExpandedChainItem(null);
	};

	const removeFromChain = (key: string) => {
		setChain((prev) => prev.filter((c) => c._key !== key));
	};

	const toggleChainItem = (key: string) => {
		setChain((prev) =>
			prev.map((c) => (c._key === key ? { ...c, enabled: !c.enabled } : c)),
		);
	};

	const updateChainParam = (key: string, paramName: string, value: number) => {
		setChain((prev) =>
			prev.map((c) =>
				c._key === key
					? { ...c, params: { ...c.params, [paramName]: value } }
					: c,
			),
		);
	};

	const moveChainItem = (index: number, direction: -1 | 1) => {
		const newIndex = index + direction;
		if (newIndex < 0 || newIndex >= chain.length) {
			return;
		}
		const items = [...chain];
		[items[index], items[newIndex]] = [items[newIndex], items[index]];
		setChain(items);
	};

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Wrench className="size-4 text-muted-foreground" />
					<span className="text-sm font-medium text-foreground">Plugins</span>
					{statusQuery.data && (
						<Badge variant="outline" className="text-xs">
							{(statusQuery.data as { plugin_count: number }).plugin_count ?? 0}{" "}
							found
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						title="Refresh"
						onClick={() =>
							queryClient.invalidateQueries({ queryKey: ["plugins"] })
						}
					>
						{pluginsQuery.isLoading ? (
							<Spinner size="sm" />
						) : (
							<RefreshCw className="h-3.5 w-3.5" />
						)}
					</Button>
					<Button
						size="sm"
						className="h-7 text-xs"
						onClick={() => scanMut.mutate()}
						disabled={scanMut.isPending}
					>
						<Search className="h-3.5 w-3.5 mr-1" /> Scan
					</Button>
				</div>
			</div>

			<div className="flex items-center gap-1 border-b border-border pb-2">
				<button
					type="button"
					className={cn(
						"text-xs px-3 py-1 rounded-md transition-colors",
						view === "audio"
							? "bg-accent/10 text-accent"
							: "text-muted-foreground hover:text-foreground",
					)}
					onClick={() => setView("audio")}
				>
					Audio Plugins
				</button>
				<button
					type="button"
					className={cn(
						"text-xs px-3 py-1 rounded-md transition-colors",
						view === "marketplace"
							? "bg-accent/10 text-accent"
							: "text-muted-foreground hover:text-foreground",
					)}
					onClick={() => setView("marketplace")}
				>
					Marketplace
				</button>
			</div>

			{view === "marketplace" ? (
				<MarketplacePlugins />
			) : (
				<div className="flex flex-1 gap-4 overflow-hidden">
					{/* Plugin browser */}
					<div className="w-72 shrink-0 overflow-y-auto space-y-1 border-r border-border pr-3">
						<div className="flex items-center gap-1 mb-2 flex-wrap">
							<button
								type="button"
								className={cn(
									"text-xs px-2 py-0.5 rounded-full border transition-colors",
									categoryFilter === null &&
										"border-accent bg-accent/10 text-accent",
								)}
								onClick={() => setCategoryFilter(null)}
							>
								All
							</button>
							{categories.map((cat) => (
								<button
									key={cat}
									type="button"
									className={cn(
										"text-xs px-2 py-0.5 rounded-full border transition-colors",
										categoryFilter === cat &&
											"border-accent bg-accent/10 text-accent",
									)}
									onClick={() => setCategoryFilter(cat)}
								>
									{cat}
								</button>
							))}
						</div>

						<div className="relative mb-2">
							<input
								className="w-full h-7 text-xs rounded-md border border-border bg-card px-2 pl-7 outline-none focus:border-accent"
								placeholder="Search plugins"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
							<Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
						</div>

						{filteredPlugins.map((plugin) => (
							<div
								key={plugin.id}
								className="border border-border rounded-lg bg-card"
							>
								<button
									type="button"
									className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-muted/30 rounded-lg transition-colors"
									onClick={() =>
										setExpandedPlugin(
											expandedPlugin === plugin.id ? null : plugin.id,
										)
									}
								>
									<div className="min-w-0">
										<span className="font-medium text-foreground truncate block">
											{plugin.name}
										</span>
										<span className="text-xs text-muted-foreground">
											{plugin.vendor} · {plugin.type}
										</span>
									</div>
									<div className="flex items-center gap-1 shrink-0">
										{plugin.is_builtin && (
											<Badge variant="secondary" className="text-[8px]">
												Built-in
											</Badge>
										)}
										{expandedPlugin === plugin.id ? (
											<ChevronDown className="size-3" />
										) : (
											<ChevronRight className="size-3" />
										)}
									</div>
								</button>
								{expandedPlugin === plugin.id && (
									<div className="px-3 pb-2 space-y-1.5 border-t border-border/50 pt-1.5">
										{Object.keys(plugin.params).length > 0 && (
											<div className="text-xs text-muted-foreground">
												{Object.keys(plugin.params).length} parameters
											</div>
										)}
										<Button
											size="sm"
											className="h-6 text-xs w-full"
											variant="outline"
											onClick={() => addToChain(plugin)}
										>
											<Plus className="size-3 mr-1" /> Add to Chain
										</Button>
									</div>
								)}
							</div>
						))}
						{filteredPlugins.length === 0 && (
							<div className="text-xs text-muted-foreground text-center py-8">
								<Plug className="size-8 mx-auto mb-2 opacity-30" />
								<p>No plugins found</p>
								<Button
									size="sm"
									className="h-6 text-xs mt-2"
									variant="outline"
									onClick={() => scanMut.mutate()}
								>
									Scan for plugins
								</Button>
							</div>
						)}
					</div>

					{/* Plugin chain */}
					<div className="flex-1 overflow-y-auto space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-xs font-medium text-foreground">
								Plugin Chain {chain.length > 0 && `(${chain.length})`}
							</span>
						</div>

						{chain.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
								<Plug className="size-10 mb-2 opacity-30" />
								<p className="text-xs">
									Click a plugin on the left to add it to the chain
								</p>
								<p className="text-xs text-muted-foreground/60 mt-1">
									Drag to reorder, toggle bypass, tweak parameters
								</p>
							</div>
						) : (
							<>
								<div className="space-y-1.5">
									{chain.map((item, index) => (
										<div
											key={item._key}
											className="border border-border rounded-lg bg-card"
										>
											<div className="flex items-center gap-2 px-3 py-2">
												<div className="flex flex-col gap-0.5 opacity-30">
													<button
														type="button"
														aria-label="Move up"
														title="Move up"
														className="size-3 text-[8px] leading-none hover:text-foreground"
														onClick={() => moveChainItem(index, -1)}
														disabled={index === 0}
													>
														&#9650;
													</button>
													<button
														type="button"
														aria-label="Move down"
														title="Move down"
														className="size-3 text-[8px] leading-none hover:text-foreground"
														onClick={() => moveChainItem(index, 1)}
														disabled={index === chain.length - 1}
													>
														&#9660;
													</button>
												</div>
												<button
													type="button"
													aria-label={
														item.enabled ? "Disable plugin" : "Enable plugin"
													}
													title={
														item.enabled ? "Disable plugin" : "Enable plugin"
													}
													onClick={() => toggleChainItem(item._key)}
													className={cn(
														"p-1 rounded transition-colors",
														item.enabled
															? "text-accent"
															: "text-muted-foreground/30",
													)}
												>
													<Power className="size-3" />
												</button>
												<span
													className={cn(
														"text-xs font-medium flex-1",
														!item.enabled &&
															"line-through text-muted-foreground/50",
													)}
												>
													{item.plugin.name}
												</span>
												<Badge variant="secondary" className="text-[8px]">
													{item.plugin.vendor}
												</Badge>
												<button
													type="button"
													aria-label={
														expandedChainItem === item._key
															? "Collapse plugin"
															: "Expand plugin"
													}
													title={
														expandedChainItem === item._key
															? "Collapse plugin"
															: "Expand plugin"
													}
													onClick={() =>
														setExpandedChainItem(
															expandedChainItem === item._key
																? null
																: item._key,
														)
													}
													className="text-muted-foreground hover:text-foreground"
												>
													{expandedChainItem === item._key ? (
														<ChevronDown className="size-3" />
													) : (
														<ChevronRight className="size-3" />
													)}
												</button>
												<button
													type="button"
													aria-label="Remove plugin from chain"
													title="Remove plugin from chain"
													onClick={() => removeFromChain(item._key)}
													className="text-destructive/60 hover:text-destructive"
												>
													<Trash2 className="size-3" />
												</button>
											</div>

											{expandedChainItem === item._key && (
												<div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2">
													{Object.entries(item.plugin.params).length > 0 ? (
														Object.entries(item.plugin.params).map(
															([paramName, paramDef]) => (
																<div key={paramName}>
																	<div className="flex items-center justify-between mb-1">
																		<Label className="text-xs text-muted-foreground">
																			{paramName}
																		</Label>
																		<span className="text-xs font-mono text-muted-foreground tabular-nums">
																			{item.params[paramName]?.toFixed(
																				paramDef.unit === "dB" ? 1 : 2,
																			)}
																			{paramDef.unit ? ` ${paramDef.unit}` : ""}
																		</span>
																	</div>
																	<Slider
																		min={paramDef.min}
																		max={paramDef.max}
																		step={(paramDef.max - paramDef.min) / 100}
																		value={[
																			item.params[paramName] ??
																				paramDef.default,
																		]}
																		onValueChange={([v]) =>
																			updateChainParam(item._key, paramName, v)
																		}
																		className="h-4"
																	/>
																</div>
															),
														)
													) : (
														<p className="text-xs text-muted-foreground">
															No parameters
														</p>
													)}
												</div>
											)}
										</div>
									))}
								</div>

								<Separator className="my-2" />

								<div className="flex items-center justify-center text-xs text-muted-foreground">
									<Speaker className="size-3 mr-1" />
									Chain has {chain.filter((c) => c.enabled).length} active
									plugins
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
