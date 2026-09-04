import {
	PauseIcon as Pause,
	PlayIcon as Play,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";

export function ReferenceVoicesBrowser() {
	const { toast } = useToast();
	const qc = useQueryClient();
	const [language, setLanguage] = useState<string>("");
	const [category, setCategory] = useState<string>("");
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
			// biome-ignore lint/correctness/useHookAtTopLevel: false positive — this is an API client method, not a React hook
			apiClient.useReferenceVoice(voiceId, name),
		onSuccess: (res) => {
			qc.invalidateQueries({ queryKey: ["voiceProfiles"] });
			toast({
				title: `Created profile "${res.profile_name}" from reference voice`,
			});
		},
		onError: (e) => showStudioErrorToast(e),
	});

	const voices = data?.voices ?? [];
	const filtered = voices.filter(
		(v) =>
			!search ||
			v.name.toLowerCase().includes(search.toLowerCase()) ||
			v.description.toLowerCase().includes(search.toLowerCase()),
	);

	const togglePlay = async (voiceId: string) => {
		if (playingId === voiceId) {
			audioRef.current?.pause();
			setPlayingId(null);
			return;
		}
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
		}
		const url = await apiClient.getReferenceVoiceAudioUrl(voiceId);
		const audio = new Audio(url);
		audioRef.current = audio;
		setPlayingId(voiceId);
		audio.onended = () => setPlayingId(null);
		audio.onerror = () => setPlayingId(null);
		await audio.play().catch(() => setPlayingId(null));
	};

	if (isLoading) {
		return (
			<div className="p-4 text-sm text-muted-foreground">
				Loading reference voices…
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex gap-2">
				<Input
					placeholder="Search voices…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="h-8 flex-1"
				/>
				<Select value={language} onValueChange={setLanguage}>
					<SelectTrigger className="w-32 h-8">
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
					<SelectTrigger className="w-32 h-8">
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
			{(
				data as unknown as {
					pack_downloaded?: boolean;
					manifest_count?: number;
				}
			)?.pack_downloaded === false && (
				<div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded p-2">
					Reference pack not downloaded —{" "}
					{(data as unknown as { manifest_count?: number })?.manifest_count ??
						0}{" "}
					voices in manifest, none available offline. Download from Store.
				</div>
			)}
			<div className="grid gap-2 max-h-[60vh] overflow-auto pr-1">
				{filtered.map((v) => (
					<div
						key={v.id}
						className="flex items-center gap-3 p-2 rounded border hover:bg-muted/50"
					>
						<Button
							size="icon"
							variant="ghost"
							className="size-7 shrink-0"
							onClick={() => togglePlay(v.id)}
						>
							{playingId === v.id ? (
								<Pause className="size-4" />
							) : (
								<Play className="size-4" />
							)}
						</Button>
						<div className="flex-1 min-w-0">
							<div className="text-sm font-medium truncate">{v.name}</div>
							<div className="text-xs text-muted-foreground truncate">
								{v.description}
							</div>
							<div className="flex gap-1 mt-1">
								<Badge variant="outline" className="text-xs h-4">
									{v.language}
								</Badge>
								<Badge variant="secondary" className="text-xs h-4">
									{v.category}
								</Badge>
								<span className="text-xs text-muted-foreground">
									{v.duration?.toFixed(1)}s
								</span>
							</div>
						</div>
						<Button
							size="sm"
							disabled={useMut.isPending}
							onClick={() => useMut.mutate({ voiceId: v.id, name: v.name })}
						>
							<SparklesIcon className="size-3.5 mr-1" />
							Use
						</Button>
					</div>
				))}
				{filtered.length === 0 && (
					<div className="text-sm text-muted-foreground text-center py-8">
						No voices match
					</div>
				)}
			</div>
		</div>
	);
}
