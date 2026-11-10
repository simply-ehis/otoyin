import {
	ArrowDownTrayIcon,
	MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/ui/button";
import { SearchInput } from "@/ui/input";
import { Badge, Label, Spinner } from "@/ui/primitives";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

/** Short human-readable license label for a Freesound license URL. */
export function shortLicense(licenseUrl: string): string {
	const u = (licenseUrl ?? "").toLowerCase();
	if (!u) {
		return "Unknown license";
	}
	if (u.includes("by-nc-nd")) {
		return "CC BY-NC-ND";
	}
	if (u.includes("by-nc-sa")) {
		return "CC BY-NC-SA";
	}
	if (u.includes("by-nc")) {
		return "CC BY-NC";
	}
	if (u.includes("by-sa")) {
		return "CC BY-SA";
	}
	if (u.includes("by-nd")) {
		return "CC BY-ND";
	}
	if (u.includes("/licenses/by/4.0")) {
		return "CC BY 4.0";
	}
	if (u.includes("/licenses/by/3.0")) {
		return "CC BY 3.0";
	}
	if (u.includes("/licenses/by/")) {
		return "CC BY";
	}
	if (u.includes("publicdomain")) {
		return "Public Domain";
	}
	if (u.includes("cc0")) {
		return "CC0";
	}
	return licenseUrl;
}

interface FreesoundResult {
	id: number;
	name: string;
	username: string;
	license: string;
	duration: number;
	previews: { "preview-hq-ogg": string; "preview-lq-ogg": string };
	tags: string[];
}

export function FreeSoundsPanel() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [submitted, setSubmitted] = useState("");

	const searchQuery = useQuery({
		queryKey: ["freesound-search", submitted, page],
		queryFn: () => apiClient.searchFreesound(submitted, page),
		enabled: submitted.length > 0,
	});

	const downloadMut = useMutation({
		mutationFn: (r: FreesoundResult) =>
			apiClient.downloadFreesound(r.id, r.previews["preview-hq-ogg"]),
		onSuccess: (_, r) => {
			toast({ title: `Cached: ${r.name}` });
			void queryClient.invalidateQueries({ queryKey: ["library"] });
		},
		onError: () => toast({ title: "Download failed", variant: "destructive" }),
	});

	function handleSearch() {
		if (!query.trim()) {
			return;
		}
		setPage(1);
		setSubmitted(query.trim());
	}

	const results: FreesoundResult[] = searchQuery.data?.results ?? [];
	const count = searchQuery.data?.count ?? 0;

	return (
		<div className="space-y-3">
			<div className="flex max-w-4xl items-center gap-2">
				<div className="relative flex-1">
					<MagnifyingGlassIcon
						aria-hidden="true"
						className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<SearchInput
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleSearch();
							}
						}}
						placeholder="Search Freesound (e.g. thunder, footsteps, door creak)"
						className="h-9 pl-8 text-xs"
						aria-label="Search Freesound"
					/>
				</div>
				<Button
					type="button"
					size="sm"
					title="Search"
					aria-label="Search Freesound"
					onClick={handleSearch}
				>
					Search
				</Button>
			</div>

			{searchQuery.isFetching ? (
				<LoadingState label="Searching Freesound" />
			) : null}

			{searchQuery.isError ? (
				<EmptyState
					title="Freesound unavailable"
					body="Set FREESOUND_API_KEY on the backend, or check the connection."
				/>
			) : null}

			{searchQuery.data && results.length === 0 ? (
				<EmptyState
					title="No results"
					body={`Nothing matched "${submitted}".`}
				/>
			) : null}

			{results.length > 0 ? (
				<>
					<p className="text-xs tabular-nums text-muted-foreground">
						{count} sounds found
					</p>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{results.map((r) => (
							<div
								key={r.id}
								className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
							>
								<div className="min-w-0 flex-1">
									<p
										className="truncate text-xs font-medium text-foreground"
										title={r.name}
									>
										{r.name}
									</p>
									<p className="truncate text-xs tabular-nums text-muted-foreground">
										{r.username} · {r.duration.toFixed(1)}s
									</p>
									<p
										className="truncate text-xs text-muted-foreground"
										title={r.license}
									>
										{shortLicense(r.license)}
									</p>
								</div>
								{/* biome-ignore lint/a11y/useMediaCaption: SFX preview, no dialogue to caption */}
								<audio
									controls
									preload="none"
									src={r.previews["preview-lq-ogg"]}
									className="h-8 w-28"
									aria-label={`Preview ${r.name}`}
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="size-8 shrink-0 p-0"
									title="Download to library"
									aria-label={`Download ${r.name} to library`}
									disabled={downloadMut.isPending}
									onClick={() => downloadMut.mutate(r)}
								>
									{downloadMut.isPending ? (
										<Spinner size="xs" />
									) : (
										<ArrowDownTrayIcon
											className="size-3.5"
											aria-hidden="true"
										/>
									)}
								</Button>
							</div>
						))}
					</div>

					<div className="flex items-center justify-center gap-3 pt-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={page <= 1}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
						>
							Previous
						</Button>
						<Label className="text-xs tabular-nums">Page {page}</Label>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={page * 20 >= count}
							onClick={() => setPage((p) => p + 1)}
						>
							Next
						</Button>
					</div>
				</>
			) : null}

			<Badge tone="neutral" className="self-start">
				Previews stream from Freesound · downloads land in the library
			</Badge>
		</div>
	);
}

export function SoundEffectsView() {
	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Sound Effects" />
			<FreeSoundsPanel />
		</div>
	);
}
