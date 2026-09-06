import { PauseIcon, PlayIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { SearchInput } from "@/ui/input";
import { Badge } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, LoadingState } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

/**
 * Bundled reference-voice library: filter by language/category/search,
 * preview clips inline, adopt one as a new cloned profile.
 */
export function ReferenceVoicesBrowser() {
	const { toast } = useToast();
	const qc = useQueryClient();
	const [language, setLanguage] = useState("");
	const [category, setCategory] = useState("");
	const [search, setSearch] = useState("");
	const [playingId, setPlayingId] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ["reference-voices", language, category],
		queryFn: () =>
			apiClient.getReferenceVoices(
				language || undefined,
				category || undefined,
			),
	});

	const useMut = useMutation({
		mutationFn: ({ voiceId, name }: { voiceId: string; name: string }) =>
			// biome-ignore lint/correctness/useHookAtTopLevel: false positive — useReferenceVoice is an API client method, not a React hook
			apiClient.useReferenceVoice(voiceId, name),
		onSuccess: (res) => {
			void qc.invalidateQueries({ queryKey: ["voiceProfiles"] });
			toast({
				title: `Created profile "${res.profile_name}" from reference voice`,
			});
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const voices = data?.voices ?? [];
	const q = search.trim().toLowerCase();
	const filtered = voices.filter(
		(v) =>
			!q ||
			v.name.toLowerCase().includes(q) ||
			v.description.toLowerCase().includes(q),
	);

	const togglePlay = async (voiceId: string) => {
		if (playingId === voiceId) {
			audioRef.current?.pause();
			setPlayingId(null);
			return;
		}
		audioRef.current?.pause();
		audioRef.current = null;
		try {
			const url = await apiClient.getReferenceVoiceAudioUrl(voiceId);
			const audio = new Audio(url);
			audioRef.current = audio;
			setPlayingId(voiceId);
			audio.onended = () => setPlayingId(null);
			audio.onerror = () => setPlayingId(null);
			await audio.play().catch(() => setPlayingId(null));
		} catch {
			setPlayingId(null);
		}
	};

	if (isLoading) {
		return <LoadingState label="Loading reference voices" lines={4} />;
	}

	const packInfo = data as unknown as {
		pack_downloaded?: boolean;
		manifest_count?: number;
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex gap-2">
				<SearchInput
					aria-label="Search reference voices"
					placeholder="Search voices…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					onClear={() => setSearch("")}
					className="flex-1 [&_input]:h-8"
				/>
				<Select value={language} onValueChange={setLanguage}>
					<SelectTrigger className="h-8 w-32" aria-label="Language filter">
						<SelectValue placeholder="All langs" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">All langs</SelectItem>
						{(data?.languages ?? []).map((l) => (
							<SelectItem key={l} value={l}>
								{l}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={category} onValueChange={setCategory}>
					<SelectTrigger className="h-8 w-32" aria-label="Category filter">
						<SelectValue placeholder="All cats" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">All cats</SelectItem>
						{(data?.categories ?? []).map((c) => (
							<SelectItem key={c} value={c}>
								{c}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{packInfo?.pack_downloaded === false ? (
				<p
					role="note"
					className="rounded-sm border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-text"
				>
					Reference pack not downloaded — {packInfo.manifest_count ?? 0} voices
					in manifest, none available offline. Download from Store.
				</p>
			) : null}

			{filtered.length === 0 ? (
				<EmptyState
					title="No voices match"
					body="Try a different search or filter."
				/>
			) : (
				<ul className="grid max-h-[60vh] gap-2 overflow-auto pr-1">
					{filtered.map((v) => (
						<li
							key={v.id}
							className="flex items-center gap-3 rounded-sm border border-border bg-card p-2"
						>
							<Button
								size="icon"
								variant="ghost"
								className="size-7 shrink-0"
								onClick={() => togglePlay(v.id)}
								title={playingId === v.id ? "Pause preview" : "Play preview"}
								aria-label={`${playingId === v.id ? "Pause" : "Play"} ${v.name} preview`}
								aria-pressed={playingId === v.id}
							>
								{playingId === v.id ? (
									<PauseIcon className="size-4" aria-hidden="true" />
								) : (
									<PlayIcon className="size-4" aria-hidden="true" />
								)}
							</Button>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium text-foreground">
									{v.name}
								</p>
								<p className="truncate text-xs text-muted-foreground">
									{v.description}
								</p>
								<p className="mt-1 flex items-center gap-1.5">
									<Badge tone="neutral">{v.language}</Badge>
									<Badge tone="neutral">{v.category}</Badge>
									{v.duration != null ? (
										<span className="text-xs tabular-nums text-muted-foreground">
											{v.duration.toFixed(1)}s
										</span>
									) : null}
								</p>
							</div>
							<Button
								size="sm"
								disabled={useMut.isPending}
								loading={useMut.isPending}
								onClick={() => useMut.mutate({ voiceId: v.id, name: v.name })}
							>
								<SparklesIcon className="mr-1 size-3.5" aria-hidden="true" />
								Use
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
