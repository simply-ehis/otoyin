import {
	ExclamationTriangleIcon as AlertTriangle,
	ArrowDownTrayIcon as Download,
	MagnifyingGlassIcon as Search,
	MusicalNoteIcon as Wave,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";

interface FreesoundResult {
	id: number;
	name: string;
	username: string;
	license: string;
	duration: number;
	previews: { "preview-hq-ogg": string; "preview-lq-ogg": string };
	tags: string[];
}

export function SoundEffectsView() {
	const { toast } = useToast();
	const qc = useQueryClient();
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
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<Wave className="size-5" />}
				title="Sound Effects"
				description="Freesound — curated, license-tagged SFX (requires your API key)"
			/>

			<Separator />

			{/* Search bar */}
			<div className="flex items-center gap-2">
				<div className="relative flex-1">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleSearch()}
						placeholder="Search Freesound (e.g. thunder, footsteps, door creak)"
						className="pl-8 h-9 text-xs"
						aria-label="Search Freesound"
					/>
				</div>
				<Button
					size="sm"
					onClick={handleSearch}
					title="Search"
					aria-label="Search"
				>
					<Search className="h-3.5 w-3.5 mr-1.5" />
					Search
				</Button>
			</div>

			{searchQuery.isFetching && <LoadingState label="Searching Freesound…" />}

			{searchQuery.isError && (
				<EmptyState
					variant="error"
					icon={<AlertTriangle className="size-6" />}
					title="Freesound unavailable"
					description="Set FREESOUND_API_KEY on the backend, or check your connection."
				/>
			)}

			{searchQuery.data && !results.length && (
				<EmptyState
					title="No results"
					description={`Nothing matched "${submitted}".`}
				/>
			)}

			{results.length > 0 && (
				<>
					<p className="text-xs text-muted-foreground">
						{count} sounds found
					</p>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto">
						{results.map((r) => (
							<div
								key={r.id}
								className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
							>
								<div className="min-w-0 flex-1">
									<p className="text-xs font-medium truncate" title={r.name}>
										{r.name}
									</p>
									<p className="text-xs text-muted-foreground truncate">
										{r.username} · {r.duration.toFixed(1)}s
									</p>
									<p className="text-xs text-muted-foreground/70 truncate">
										{r.license}
									</p>
								</div>
								{/* biome-ignore lint/a11y/useMediaCaption: SFX preview, no dialogue to caption */}
								<audio
									controls
									preload="none"
									src={r.previews["preview-lq-ogg"]}
									className="h-8 w-28"
								/>
								<Button
									variant="outline"
									size="icon"
									className="size-8 shrink-0"
									title="Download to library"
									aria-label={`Download ${r.name}`}
									disabled={downloadMut.isPending}
									onClick={() =>
										downloadMut.mutate(r, {
											onSuccess: () => {
												toast({ title: `Cached: ${r.name}` });
												qc.invalidateQueries({ queryKey: ["library"] });
											},
											onError: () =>
												toast({
													title: "Download failed",
													variant: "destructive",
												}),
										})
									}
								>
									{downloadMut.isPending ? (
										<Spinner size="sm" />
									) : (
										<Download className="h-3.5 w-3.5" />
									)}
								</Button>
							</div>
						))}
					</div>

					<div className="flex items-center justify-center gap-3 pt-1">
						<Button
							variant="outline"
							size="sm"
							disabled={page <= 1}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
						>
							Previous
						</Button>
						<Label className="text-xs">Page {page}</Label>
						<Button
							variant="outline"
							size="sm"
							disabled={page * 20 >= count}
							onClick={() => setPage((p) => p + 1)}
						>
							Next
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
