import {
	ArrowPathIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	PowerIcon,
	SpeakerWaveIcon,
	TrashIcon,
	WifiIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { SearchInput } from "@/ui/input";
import { Badge, Label, Separator, Spinner } from "@/ui/primitives";
import { Slider } from "@/ui/slider";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

// (removed) MarketplacePlugins import

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
	key: string;
	plugin: PluginInfo;
	enabled: boolean;
	params: Record<string, number>;
}

let chainCounter = 0;

/**
 * Plugin workbench: searchable browser with category filters on the
 * left, ordered effect chain with per-parameter sliders on the right.
 * Reorder is explicit up/down (keyboard-reachable); bypass per item.
 */
export function PluginsPage() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<string | null>(null);
	const [chain, setChain] = useState<ChainItem[]>([]);
	const [expandedChain, setExpandedChain] = useState<string | null>(null);
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
			void queryClient.invalidateQueries({ queryKey: ["plugins"] });
			void queryClient.invalidateQueries({ queryKey: ["plugin-status"] });
			toast({ title: "Plugin scan complete" });
		},
		onError: (e: Error) =>
			toast({
				title: "Scan failed",
				description: e.message,
				variant: "destructive",
			}),
	});

	const raw: PluginInfo[] = pluginsQuery.data ?? [];
	const categories = [...new Set(raw.map((p) => p.category))];
	const filtered = raw.filter((p) => {
		if (category && p.category !== category) {
			return false;
		}
		return !query || p.name.toLowerCase().includes(query.toLowerCase());
	});

	const addToChain = (plugin: PluginInfo) => {
		const params: Record<string, number> = {};
		for (const [key, param] of Object.entries(plugin.params)) {
			params[key] = param.default;
		}
		chainCounter += 1;
		setChain((prev) => [
			...prev,
			{ key: `ci-${chainCounter}`, plugin, enabled: true, params },
		]);
		setExpandedChain(null);
	};

	const move = (index: number, direction: -1 | 1) => {
		const next = index + direction;
		if (next < 0 || next >= chain.length) {
			return;
		}
		setChain((prev) => {
			const items = [...prev];
			const a = items[index];
			const b = items[next];
			if (!a || !b) {
				return prev;
			}
			items[index] = b;
			items[next] = a;
			return items;
		});
	};

	const activeCount = chain.filter((c) => c.enabled).length;

	return (
		<div className="flex h-full min-h-0 flex-col gap-4">
			<ScreenHeader
				title="Plugins"
				actions={
					<>
						{statusQuery.data ? (
							<Badge tone="neutral">
								{(statusQuery.data as { plugin_count: number }).plugin_count ??
									0}{" "}
								found
							</Badge>
						) : null}
						<Button
							variant="ghost"
							size="icon"
							title="Refresh"
							aria-label="Refresh plugin list"
							onClick={() =>
								void queryClient.invalidateQueries({ queryKey: ["plugins"] })
							}
						>
							{pluginsQuery.isLoading ? (
								<Spinner size="sm" />
							) : (
								<ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
							)}
						</Button>
						<Button
							size="sm"
							onClick={() => scanMut.mutate()}
							disabled={scanMut.isPending}
						>
							<MagnifyingGlassIcon
								className="mr-1 h-3.5 w-3.5"
								aria-hidden="true"
							/>
							Scan
						</Button>
					</>
				}
			/>

			<div
				role="tablist"
				aria-label="Plugin sources"
				className="flex items-center gap-1 border-b border-border pb-2"
			>
				{(["audio", "marketplace"] as const).map((v) => (
					<button
						key={v}
						type="button"
						role="tab"
						aria-selected={view === v}
						onClick={() => setView(v)}
						className={cn(
							"rounded-sm px-3 py-1 text-xs transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							view === v
								? "bg-secondary font-medium text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{v === "audio" ? "Audio plugins" : "Marketplace"}
					</button>
				))}
			</div>

			{view === "marketplace" ? null : (
				<div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
					<div className="w-72 shrink-0 overflow-y-auto border-r border-border pr-3">
						<fieldset className="mb-2 flex flex-wrap items-center gap-1">
							<legend className="sr-only">Categories</legend>
							<button
								type="button"
								aria-pressed={category === null}
								onClick={() => setCategory(null)}
								className={cn(
									"rounded-full border px-2 py-0.5 text-xs transition-colors",
									category === null
										? "border-accent/40 bg-secondary font-medium text-foreground"
										: "border-border text-muted-foreground hover:text-foreground",
								)}
							>
								All
							</button>
							{categories.map((cat) => (
								<button
									key={cat}
									type="button"
									aria-pressed={category === cat}
									onClick={() => setCategory(cat)}
									className={cn(
										"rounded-full border px-2 py-0.5 text-xs transition-colors",
										category === cat
											? "border-accent/40 bg-secondary font-medium text-foreground"
											: "border-border text-muted-foreground hover:text-foreground",
									)}
								>
									{cat}
								</button>
							))}
						</fieldset>
						<SearchInput
							aria-label="Search plugins"
							placeholder="Search plugins"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onClear={() => setQuery("")}
							className="mb-2 [&_input]:h-7 [&_input]:text-xs"
						/>
						{pluginsQuery.isLoading ? (
							<p className="py-8 text-center text-xs text-muted-foreground">
								Loading…
							</p>
						) : filtered.length === 0 ? (
							<EmptyState
								icon={<WifiIcon aria-hidden="true" />}
								title="No plugins found"
								body="Widen the search or scan for newly installed plugins."
								action={
									<Button
										size="sm"
										variant="outline"
										onClick={() => scanMut.mutate()}
									>
										Scan for plugins
									</Button>
								}
							/>
						) : (
							<ul className="flex flex-col gap-1.5">
								{filtered.map((plugin) => (
									<li
										key={plugin.id}
										className="rounded-md border border-border bg-card"
									>
										<button
											type="button"
											aria-expanded={expanded === plugin.id}
											onClick={() =>
												setExpanded(expanded === plugin.id ? null : plugin.id)
											}
											className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-secondary"
										>
											<span className="min-w-0">
												<span className="block truncate font-medium text-foreground">
													{plugin.name}
												</span>
												<span className="block truncate text-muted-foreground">
													{plugin.vendor} · {plugin.type}
												</span>
											</span>
											<span className="flex shrink-0 items-center gap-1">
												{plugin.is_builtin ? (
													<Badge tone="neutral">Built-in</Badge>
												) : null}
												{expanded === plugin.id ? (
													<ChevronDownIcon
														className="size-3 text-muted-foreground"
														aria-hidden="true"
													/>
												) : (
													<ChevronRightIcon
														className="size-3 text-muted-foreground"
														aria-hidden="true"
													/>
												)}
											</span>
										</button>
										{expanded === plugin.id ? (
											<div className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
												<p className="text-xs text-muted-foreground">
													{Object.keys(plugin.params).length} parameters
												</p>
												<Button
													size="sm"
													variant="outline"
													className="h-6 w-full text-xs"
													onClick={() => addToChain(plugin)}
												>
													<PlusIcon
														className="mr-1 size-3"
														aria-hidden="true"
													/>
													Add to chain
												</Button>
											</div>
										) : null}
									</li>
								))}
							</ul>
						)}
					</div>

					<div className="min-w-0 flex-1 overflow-y-auto">
						<p className="mb-2 text-xs font-medium text-foreground">
							Plugin chain{chain.length > 0 ? ` (${chain.length})` : ""}
						</p>
						{chain.length === 0 ? (
							<EmptyState
								icon={<WifiIcon aria-hidden="true" />}
								title="Chain is empty"
								body="Add a plugin from the browser. Reorder with the arrow buttons, bypass with the power switch."
							/>
						) : (
							<>
								<ul className="flex flex-col gap-1.5">
									{chain.map((item, index) => (
										<li
											key={item.key}
											className="rounded-md border border-border bg-card"
										>
											<div className="flex items-center gap-2 px-3 py-2">
												<span
													className="flex flex-col"
													role="toolbar"
													aria-label={`Reorder ${item.plugin.name}`}
												>
													<button
														type="button"
														aria-label={`Move ${item.plugin.name} up`}
														disabled={index === 0}
														onClick={() => move(index, -1)}
														className="grid size-4 place-items-center text-[8px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
													>
														▲
													</button>
													<button
														type="button"
														aria-label={`Move ${item.plugin.name} down`}
														disabled={index === chain.length - 1}
														onClick={() => move(index, 1)}
														className="grid size-4 place-items-center text-[8px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
													>
														▼
													</button>
												</span>
												<button
													type="button"
													aria-label={
														item.enabled
															? `Bypass ${item.plugin.name}`
															: `Enable ${item.plugin.name}`
													}
													aria-pressed={item.enabled}
													onClick={() =>
														setChain((prev) =>
															prev.map((c) =>
																c.key === item.key
																	? { ...c, enabled: !c.enabled }
																	: c,
															),
														)
													}
													className={cn(
														"rounded-sm p-1 transition-colors",
														item.enabled
															? "text-accent"
															: "text-muted-foreground/50",
													)}
												>
													<PowerIcon className="size-3" aria-hidden="true" />
												</button>
												<span
													className={cn(
														"flex-1 truncate text-xs font-medium",
														item.enabled
															? "text-foreground"
															: "text-muted-foreground/60 line-through",
													)}
												>
													{item.plugin.name}
												</span>
												<Badge tone="neutral">{item.plugin.vendor}</Badge>
												<button
													type="button"
													aria-label={
														expandedChain === item.key
															? "Collapse parameters"
															: "Expand parameters"
													}
													aria-expanded={expandedChain === item.key}
													onClick={() =>
														setExpandedChain(
															expandedChain === item.key ? null : item.key,
														)
													}
													className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
												>
													{expandedChain === item.key ? (
														<ChevronDownIcon
															className="size-3"
															aria-hidden="true"
														/>
													) : (
														<ChevronRightIcon
															className="size-3"
															aria-hidden="true"
														/>
													)}
												</button>
												<button
													type="button"
													aria-label={`Remove ${item.plugin.name} from chain`}
													onClick={() =>
														setChain((prev) =>
															prev.filter((c) => c.key !== item.key),
														)
													}
													className="rounded-sm p-1 text-destructive/70 transition-colors hover:text-destructive"
												>
													<TrashIcon className="size-3" aria-hidden="true" />
												</button>
											</div>
											{expandedChain === item.key ? (
												<div className="flex flex-col gap-2 border-t border-border px-3 py-2">
													{Object.entries(item.plugin.params).length > 0 ? (
														Object.entries(item.plugin.params).map(
															([name, def]) => (
																<div key={name}>
																	<p className="mb-1 flex items-center justify-between">
																		<Label className="text-xs text-muted-foreground">
																			{name}
																		</Label>
																		<span className="font-mono text-xs tabular-nums text-muted-foreground">
																			{(
																				item.params[name] ?? def.default
																			).toFixed(def.unit === "dB" ? 1 : 2)}
																			{def.unit ? ` ${def.unit}` : ""}
																		</span>
																	</p>
																	<Slider
																		min={def.min}
																		max={def.max}
																		step={(def.max - def.min) / 100}
																		value={[item.params[name] ?? def.default]}
																		onValueChange={([v]) =>
																			setChain((prev) =>
																				prev.map((c) =>
																					c.key === item.key
																						? {
																								...c,
																								params: {
																									...c.params,
																									[name]: v ?? def.default,
																								},
																							}
																						: c,
																				),
																			)
																		}
																		aria-label={`${item.plugin.name} ${name}`}
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
											) : null}
										</li>
									))}
								</ul>
								<Separator className="my-2" />
								<p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
									<SpeakerWaveIcon className="size-3" aria-hidden="true" />
									Chain has {activeCount} active plugin
									{activeCount === 1 ? "" : "s"}
								</p>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
