import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { Feature, HelpSearchResult } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";

const CATEGORIES = [
	"Voice generation",
	"Audio Studio",
	"Mixer & delivery",
	"Dialogue & long-form",
	"Real-time voice",
	"Music, SFX & instruments",
	"Spatial audio",
	"Agents & automation",
] as const;

export function HelpCenter({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<HelpSearchResult[]>([]);
	const [features, setFeatures] = useState<Feature[]>([]);
	const [showAll, setShowAll] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			return;
		}
		void (async () => {
			try {
				const data = await apiClient.getHelpFeatures();
				setFeatures(data.features);
			} catch (error) {
				showStudioErrorToast(error);
			}
		})();
	}, [open]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const onPointerDown = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				onClose();
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, onClose]);

	useEffect(() => {
		if (query.length < 2) {
			setResults([]);
			return;
		}
		const timer = setTimeout(() => {
			void (async () => {
				try {
					const data = await apiClient.searchHelp(query);
					setResults(data.results);
				} catch (error) {
					showStudioErrorToast(error);
				}
			})();
		}, 300);
		return () => clearTimeout(timer);
	}, [query]);

	const visibleFeatures = showAll ? features : features.slice(0, 12);

	return (
		<>
			{open && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Help Center"
					className="fixed inset-0 z-50 flex items-start justify-center pt-16 "
					style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
				>
					<div
						ref={containerRef}
						className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4"
					>
						<div className="p-4 border-b border-border">
							<div className="relative">
								<MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
								<input
									type="text"
									aria-label="Search help"
									placeholder="Search features, tools, shortcuts (e.g. 'voice cloning', 'podcast')"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									className="w-full pl-10 pr-4 py-2 bg-background rounded-md border border-input focus:outline-none focus:ring-2 focus:ring-ring"
								/>
								{query && (
									<button
										type="button"
										onClick={() => setQuery("")}
										className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
										aria-label="Clear search"
									>
										<XMarkIcon className="size-4" />
									</button>
								)}
							</div>
						</div>

						<div className="max-h-[500px] overflow-y-auto p-4">
							{query.length >= 2 ? (
								<>
									<h3 className="text-xs font-medium text-muted-foreground mb-3">
										{results.length} result{results.length !== 1 ? "s" : ""}{" "}
										found
									</h3>
									{results.length > 0 ? (
										<ul className="space-y-2">
											{results.map((result) => (
												<li
													key={result.id}
													className="p-3 rounded-md border border-border hover:bg-accent/50 cursor-pointer"
												>
													<div className="flex justify-between items-start gap-2">
														<div className="flex-1">
															<span className="text-xs font-medium text-muted-foreground">
																{result.category}
															</span>
															<h4 className="font-medium text-sm mt-0.5">
																{result.name}
															</h4>
															<p className="text-xs text-muted-foreground mt-1 line-clamp-2">
																{result.summary}
															</p>
															{result.tools.length > 0 && (
																<div className="mt-1.5 flex flex-wrap gap-1">
																	{result.tools.slice(0, 3).map((tool) => (
																		<span
																			key={tool}
																			className="text-xs bg-secondary px-1.5 py-0.5 rounded"
																		>
																			{tool}
																		</span>
																	))}
																</div>
															)}
														</div>
														<span
															className="text-xs text-muted-foreground/50"
															style={{ fontSize: "10px" }}
														>
															{result.score}
														</span>
													</div>
												</li>
											))}
										</ul>
									) : (
										<p className="text-sm text-muted-foreground py-8 text-center">
											No results for "{query}". Try another keyword.
										</p>
									)}
								</>
							) : (
								<>
									{/* Popular actions */}
									<div className="mb-4">
										<h3 className="text-xs font-medium text-muted-foreground mb-2">
											Popular actions
										</h3>
										<div className="flex flex-wrap gap-2">
											{[
												{
													label: "Generate speech",
													path: "/",
													query: "how to generate speech",
												},
												{
													label: "Clone a voice",
													path: "/voices",
													query: "how to clone a voice",
												},
												{
													label: "Create a story",
													path: "/stories",
													query: "how to create a story",
												},
												{
													label: "Import SoundFonts",
													path: "/instruments",
													query: "how to import instruments",
												},
												{
													label: "Mix audio",
													path: "/mixer",
													query: "how to mix audio",
												},
												{
													label: "Record capture",
													path: "/captures",
													query: "how to record audio",
												},
											].map((action) => (
												<button
													key={action.label}
													type="button"
													onClick={() => {
														setQuery(action.query);
													}}
													className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary-hover hover:text-foreground transition-colors"
												>
													{action.label}
												</button>
											))}
										</div>
									</div>

									{/* Current page context */}
									<div className="mb-4 rounded-md border border-accent/20 bg-accent/5 p-3">
										<p className="text-xs font-medium text-accent">
											You're on the {(() => {
												const path = window.location.pathname;
												const names: Record<string, string> = {
													"/": "Generate",
													"/voices": "Voices",
													"/stories": "Stories",
													"/audiobooks": "Audiobooks",
													"/audio-studio": "Audio Studio",
													"/workspace": "Workspace",
													"/instruments": "Instruments",
													"/effects": "Effects",
													"/captures": "Captures",
													"/settings": "Settings",
												};
												return names[path] ?? path;
											})()} page.
										</p>
										<button
											type="button"
											onClick={() => {
												setQuery(
													`what can I do on ${window.location.pathname}`,
												);
											}}
											className="mt-1 text-xs text-accent hover:underline"
										>
											What can I do here?
										</button>
									</div>

									<h3 className="text-xs font-medium text-muted-foreground mb-3">
										Browse by category
									</h3>
									<div className="grid gap-6 sm:grid-cols-2">
										{CATEGORIES.map((cat) => {
											const catFeatures = visibleFeatures.filter(
												(f) => f.category === (cat as string),
											);
											if (catFeatures.length === 0) {
												return null;
											}
											return (
												<div key={cat}>
													<h4 className="text-xs font-medium text-muted-foreground mb-1.5">
														{cat}
													</h4>
													<ul className="space-y-1">
														{catFeatures.map((feature) => (
															<li key={feature.id} className="text-sm">
																<span
																	className={cn(
																		"font-medium",
																		query && "cursor-pointer",
																	)}
																>
																	{feature.name}
																</span>
																<p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
																	{feature.summary}
																</p>
															</li>
														))}
													</ul>
												</div>
											);
										})}
									</div>

									{!showAll && features.length > 12 && (
										<button
											type="button"
											onClick={() => setShowAll(true)}
											className="mt-6 w-full text-center text-sm text-primary hover:text-primary/80"
										>
											Show all {features.length} features
										</button>
									)}
								</>
							)}
						</div>

						<div className="p-3 border-t border-border bg-secondary rounded-b-lg">
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<div className="flex items-center gap-3">
									<span>
										<kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">
											Esc
										</kbd>{" "}
										to close
									</span>
									<button
										type="button"
										onClick={() => {
											onClose();
											navigate({ to: "/settings/shortcuts" });
										}}
										className="text-primary hover:underline"
									>
										Keyboard shortcuts
									</button>
								</div>
								<a
									href="https://github.com/otoyin/otoyin"
									target="_blank"
									rel="noopener noreferrer"
									className="text-primary hover:underline"
									onClick={(e) => e.stopPropagation()}
								>
									Docs
								</a>
							</div>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
