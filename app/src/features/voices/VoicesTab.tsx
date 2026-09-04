import {
	MicrophoneIcon,
	PlusIcon,
} from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/button";
import { SearchInput } from "@/ui/input";
import { MultiSelect } from "@/ui/multi-select";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "@/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { apiClient } from "@/lib/api/client";
import type { VoiceProfileResponse } from "@/lib/api/types";
import { inferStudioError, showStudioErrorToast } from "@/lib/errors";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { cn } from "@/lib/utils/cn";
import { useServerStore } from "@/stores/serverStore";
import { useUIStore } from "@/stores/uiStore";
import { QuickCloneDialog } from "./QuickCloneDialog";
import { ReferenceVoicesBrowser } from "./ReferenceVoicesBrowser";
import { VoiceInspector } from "./VoiceInspector";

/**
 * Voices: searchable profile table with channel routing, inspector
 * rail (rename, effects, samples), quick clone, reference library.
 * Full create/edit form lands next slice; creation entry is Quick Clone.
 */
export function VoicesTab() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { data: profiles, isLoading, error } = useProfiles();
	const selectedId = useUIStore((s) => s.selectedVoiceId);
	const setSelectedId = useUIStore((s) => s.setSelectedVoiceId);
	const [search, setSearch] = useState("");
	const [debounced, setDebounced] = useState("");
	const [cloneOpen, setCloneOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (timer.current) {
			clearTimeout(timer.current);
		}
		timer.current = setTimeout(() => setDebounced(search), 150);
		return () => {
			if (timer.current) {
				clearTimeout(timer.current);
			}
		};
	}, [search]);

	const filtered = useMemo(() => {
		const q = debounced.trim().toLowerCase();
		if (!profiles) {
			return [];
		}
		if (!q) {
			return profiles;
		}
		return profiles.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.description?.toLowerCase().includes(q) ||
				p.language.toLowerCase().includes(q),
		);
	}, [profiles, debounced]);

	useEffect(() => {
		if (!selectedId && profiles && profiles.length > 0 && profiles[0]) {
			setSelectedId(profiles[0].id);
		}
		if (selectedId && profiles && !profiles.find((p) => p.id === selectedId)) {
			setSelectedId(profiles.length > 0 && profiles[0] ? profiles[0].id : null);
		}
	}, [profiles, selectedId, setSelectedId]);

	const { data: assignments } = useQuery({
		queryKey: ["profile-channels"],
		queryFn: async () => {
			const out: Record<string, string[]> = {};
			for (const profile of profiles ?? []) {
				try {
					const result = await apiClient.getProfileChannels(profile.id);
					out[profile.id] = result.channel_ids;
				} catch {
					out[profile.id] = [];
				}
			}
			return out;
		},
		enabled: !!profiles,
	});
	const { data: channels } = useQuery({
		queryKey: ["channels"],
		queryFn: () => apiClient.listChannels(),
	});

	if (error) {
		const studioErr = inferStudioError(error);
		return (
			<div className="flex h-full items-center justify-center text-center">
				<div>
					<p className="font-medium text-destructive">{studioErr.title}</p>
					<p className="mt-1 text-sm text-muted-foreground">{studioErr.message}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<Tabs defaultValue="my-voices" className="flex min-h-0 flex-1 flex-col">
				<div className="flex flex-wrap items-center gap-3">
					<TabsList>
						<TabsTrigger value="my-voices">My voices</TabsTrigger>
						<TabsTrigger value="reference">Reference library</TabsTrigger>
					</TabsList>
					<span className="flex-1" />
					<SearchInput
						aria-label={t("voicesTab.searchPlaceholder")}
						placeholder={t("voicesTab.searchPlaceholder")}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						onClear={() => setSearch("")}
						shortcut="Ctrl K"
						className="w-[240px] [&_input]:h-8"
					/>
					<Button size="sm" onClick={() => setCloneOpen(true)}>
						<PlusIcon className="mr-1.5 size-4" aria-hidden="true" />
						{t("voicesTab.newVoice")}
					</Button>
				</div>

				<TabsContent value="my-voices" className="mt-3 min-h-0 flex-1">
					{isLoading ? (
						<LoadingState label={t("voicesTab.loading")} lines={8} />
					) : (
						<div className="flex h-full min-h-0 gap-0 overflow-hidden">
							<div className="min-w-0 flex-1 overflow-y-auto">
								{filtered.length === 0 ? (
									<EmptyState
										icon={<MicrophoneIcon aria-hidden="true" />}
										title={search ? "No matching voices" : "No voice profiles yet"}
										body={
											search
												? "Try a different search term."
												: "Clone a voice to get started."
										}
										action={
											search ? undefined : (
												<Button size="sm" onClick={() => setCloneOpen(true)}>
													Clone a voice
												</Button>
											)
										}
									/>
								) : (
									<Table>
										<TableHead>
											<tr>
												<TableHeaderCell className="w-[30%]">
													{t("voicesTab.columns.name")}
												</TableHeaderCell>
												<TableHeaderCell className="w-[10%]">
													{t("voicesTab.columns.language")}
												</TableHeaderCell>
												<TableHeaderCell numeric className="w-[10%]">
													{t("voicesTab.columns.generations")}
												</TableHeaderCell>
												<TableHeaderCell numeric className="w-[8%]">
													{t("voicesTab.columns.samples")}
												</TableHeaderCell>
												<TableHeaderCell className="w-[8%]">
													{t("voicesTab.columns.effects")}
												</TableHeaderCell>
												<TableHeaderCell className="w-[24%]">
													{t("voicesTab.columns.channels")}
												</TableHeaderCell>
											</tr>
										</TableHead>
										<TableBody>
											{filtered.map((profile) => (
												<VoiceRow
													key={profile.id}
													profile={profile}
													selected={selectedId === profile.id}
													onSelect={() => setSelectedId(profile.id)}
													channelIds={assignments?.[profile.id] ?? []}
													channels={(channels ?? []).map((c) => ({
														id: c.id,
														name: c.name,
														is_default: c.is_default,
													}))}
													onChannels={(ids) => {
														apiClient
															.setProfileChannels(profile.id, ids)
															.then(() =>
																queryClient.invalidateQueries({
																	queryKey: ["profile-channels"],
																}),
															)
															.catch((e: unknown) => showStudioErrorToast(e));
													}}
												/>
											))}
										</TableBody>
									</Table>
								)}
							</div>
							{selectedId ? (
								<div className="hidden w-[340px] shrink-0 border-l border-border bg-card md:block">
									<VoiceInspector key={selectedId} profileId={selectedId} />
								</div>
							) : null}
						</div>
					)}
				</TabsContent>
				<TabsContent value="reference" className="mt-3 min-h-0 flex-1 overflow-y-auto">
					<ReferenceVoicesBrowser />
				</TabsContent>
			</Tabs>

			<QuickCloneDialog
				open={cloneOpen}
				onOpenChange={setCloneOpen}
				onComplete={(id) => {
					setCloneOpen(false);
					setSelectedId(id);
				}}
			/>
		</div>
	);
}

function VoiceRow({
	profile,
	selected,
	onSelect,
	channelIds,
	channels,
	onChannels,
}: {
	profile: VoiceProfileResponse;
	selected: boolean;
	onSelect: () => void;
	channelIds: string[];
	channels: { id: string; name: string; is_default: boolean }[];
	onChannels: (ids: string[]) => void;
}) {
	const { t } = useTranslation();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const [avatarError, setAvatarError] = useState(false);
	const avatarUrl = profile.avatar_path
		? `${serverUrl}/profiles/${profile.id}/avatar`
		: null;
	const enabledFx = profile.effects_chain?.filter((e) => e.enabled) ?? [];

	return (
		<TableRow
			onClick={onSelect}
			className={cn("cursor-pointer", selected && "bg-secondary")}
			aria-selected={selected}
		>
			<TableCell>
				<span className="flex w-full min-w-0 items-center gap-2">
					<span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
						{avatarUrl && !avatarError ? (
							<img
								src={avatarUrl}
								alt=""
								className="h-full w-full object-cover"
								onError={() => setAvatarError(true)}
							/>
						) : (
							<MicrophoneIcon className="size-4 text-muted-foreground" aria-hidden="true" />
						)}
					</span>
					<span className="min-w-0">
						<span className="block truncate font-medium">{profile.name}</span>
						{profile.description ? (
							<span className="block truncate text-sm text-muted-foreground">
								{profile.description}
							</span>
						) : null}
					</span>
				</span>
			</TableCell>
			<TableCell>{profile.language}</TableCell>
			<TableCell numeric>{profile.generation_count}</TableCell>
			<TableCell numeric>{profile.sample_count}</TableCell>
			<TableCell>
				{enabledFx.length > 0 ? (
					<span
						className="inline-flex items-center gap-1 text-xs text-accent"
						title={enabledFx.map((e) => e.type).join(" → ")}
					>
						● {enabledFx.length}
					</span>
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				)}
			</TableCell>
			<TableCell>
				<span onClick={(e) => e.stopPropagation()}>
					<MultiSelect
						options={channels.map((ch) => ({
							value: ch.id,
							label: ch.is_default
								? t("voicesTab.channelDefaultLabel", { name: ch.name })
								: ch.name,
						}))}
						value={channelIds}
						onChange={onChannels}
						placeholder={t("voicesTab.selectChannels")}
						className="w-full"
					/>
				</span>
			</TableCell>
		</TableRow>
	);
}
