import {
	MicrophoneIcon as Mic,
	PlusIcon as Plus,
	MagnifyingGlassIcon as Search,
	SparklesIcon as Sparkles,
} from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";

import { MultiSelect } from "@/components/ui/multi-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/VoiceProfiles/ProfileForm";
import { ReferenceVoicesBrowser } from "@/components/VoiceProfiles/ReferenceVoicesBrowser";
import { apiClient } from "@/lib/api/client";
import type { VoiceProfileResponse } from "@/lib/api/types";
import { BOTTOM_SAFE_AREA_PADDING } from "@/lib/constants/ui";
import { inferStudioError, showStudioErrorToast } from "@/lib/errors";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";
import { useServerStore } from "@/stores/serverStore";
import { useUIStore } from "@/stores/uiStore";
import { VoiceInspector } from "./VoiceInspector";

export function VoicesTab() {
	const { t } = useTranslation();
	const { data: profiles, isLoading, error } = useProfiles();
	const queryClient = useQueryClient();
	const setDialogOpen = useUIStore((state) => state.setProfileDialogOpen);
	const selectedVoiceId = useUIStore((state) => state.selectedVoiceId);
	const setSelectedVoiceId = useUIStore((state) => state.setSelectedVoiceId);
	const scrollRef = useRef<HTMLDivElement>(null);
	const audioUrl = usePlayerStore((state) => state.audioUrl);
	const isPlayerVisible = !!audioUrl;
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleSearchChange = useCallback((value: string) => {
		setSearch(value);
		if (searchTimerRef.current) {
			clearTimeout(searchTimerRef.current);
		}
		searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 150);
	}, []);

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}
		};
	}, []);

	const filteredProfiles = useMemo(() => {
		if (!profiles) {
			return [];
		}
		if (!debouncedSearch.trim()) {
			return profiles;
		}
		const q = debouncedSearch.toLowerCase();
		return profiles.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.description?.toLowerCase().includes(q) ||
				p.language.toLowerCase().includes(q),
		);
	}, [profiles, debouncedSearch]);

	// Auto-select first profile if none selected
	useEffect(() => {
		if (!selectedVoiceId && profiles && profiles.length > 0) {
			setSelectedVoiceId(profiles[0].id);
		}
		// Clear selection if selected profile was deleted
		if (
			selectedVoiceId &&
			profiles &&
			!profiles.find((p) => p.id === selectedVoiceId)
		) {
			setSelectedVoiceId(profiles.length > 0 ? profiles[0].id : null);
		}
	}, [profiles, selectedVoiceId, setSelectedVoiceId]);

	// Get channel assignments for each profile
	const { data: channelAssignments } = useQuery({
		queryKey: ["profile-channels"],
		queryFn: async () => {
			if (!profiles) {
				return {};
			}
			const assignments: Record<string, string[]> = {};
			for (const profile of profiles) {
				try {
					const result = await apiClient.getProfileChannels(profile.id);
					assignments[profile.id] = result.channel_ids;
				} catch {
					assignments[profile.id] = [];
				}
			}
			return assignments;
		},
		enabled: !!profiles,
	});

	// Get all channels
	const { data: channels } = useQuery({
		queryKey: ["channels"],
		queryFn: () => apiClient.listChannels(),
	});

	const handleChannelChange = async (
		profileId: string,
		channelIds: string[],
	) => {
		try {
			await apiClient.setProfileChannels(profileId, channelIds);
			queryClient.invalidateQueries({ queryKey: ["profile-channels"] });
		} catch (error) {
			showStudioErrorToast(error);
		}
	};

	if (error) {
		const studioErr = inferStudioError(error);
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-destructive text-center space-y-1">
					<p className="font-medium">{studioErr.title}</p>
					<p className="text-sm text-muted-foreground">{studioErr.message}</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-muted-foreground">{t("voicesTab.loading")}</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col gap-0 overflow-hidden -mx-8">
			<Tabs defaultValue="my-voices" className="flex-1 flex flex-col min-h-0">
				<div className="px-8 pt-2">
					<TabsList className="h-8">
						<TabsTrigger value="my-voices" className="text-xs">
							My Voices
						</TabsTrigger>
						<TabsTrigger value="reference" className="text-xs">
							Reference Library
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent
					value="my-voices"
					className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden"
				>
					<div className="flex-1 flex gap-0 overflow-hidden">
						<div className="flex-1 min-w-0 flex flex-col overflow-hidden">
							{/* Sticky Header */}
							<div className="shrink-0 pl-8 pr-8 pb-4 pt-2">
								<div className="flex items-center gap-3">
									<h1 className="text-2xl font-bold">{t("voicesTab.title")}</h1>
									<div className="flex-1" />
									<div className="relative w-[240px]">
										<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											placeholder={t("voicesTab.searchPlaceholder")}
											value={search}
											onChange={(e) => handleSearchChange(e.target.value)}
											className="h-10 pl-8 text-sm rounded-full focus-visible:ring-0 focus-visible:ring-offset-0"
										/>
									</div>
									<Button onClick={() => setDialogOpen(true)}>
										<Plus className="size-4 mr-2" />
										{t("voicesTab.newVoice")}
									</Button>
								</div>
							</div>

							{/* Scrollable Content */}
							<div
								ref={scrollRef}
								className={cn(
									"flex-1 overflow-y-auto overflow-x-hidden relative z-0",
									isPlayerVisible && BOTTOM_SAFE_AREA_PADDING,
								)}
							>
								<Table className="table-fixed [&_td:first-child]:pl-8 [&_th:first-child]:pl-8">
									<TableHeader>
										<TableRow>
											<TableHead className="w-[30%]">
												{t("voicesTab.columns.name")}
											</TableHead>
											<TableHead className="w-[10%]">
												{t("voicesTab.columns.language")}
											</TableHead>
											<TableHead className="w-[10%]">
												{t("voicesTab.columns.generations")}
											</TableHead>
											<TableHead className="w-[8%]">
												{t("voicesTab.columns.samples")}
											</TableHead>
											<TableHead className="w-[8%]">
												{t("voicesTab.columns.effects")}
											</TableHead>
											<TableHead className="w-[24%]">
												{t("voicesTab.columns.channels")}
											</TableHead>
											<TableHead className="w-6"></TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{filteredProfiles.length === 0 ? (
											<TableRow>
												<TableCell colSpan={7} className="h-40">
													<EmptyState
														title={
															search
																? "No matching voices"
																: "No voice profiles yet"
														}
														description={
															search
																? "Try a different search term."
																: "Record or import your first voice profile to get started."
														}
														action={
															search ? undefined : (
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => setDialogOpen(true)}
																>
																	<Plus className="size-3 mr-1" />
																	Create profile
																</Button>
															)
														}
													/>
												</TableCell>
											</TableRow>
										) : (
											filteredProfiles.map((profile) => (
												<VoiceRow
													key={profile.id}
													profile={profile}
													isSelected={selectedVoiceId === profile.id}
													onSelect={() => setSelectedVoiceId(profile.id)}
													channelIds={channelAssignments?.[profile.id] || []}
													channels={channels || []}
													onChannelChange={(channelIds) =>
														handleChannelChange(profile.id, channelIds)
													}
												/>
											))
										)}
									</TableBody>
								</Table>
							</div>
						</div>

						{/* Right: Inspector */}
						{selectedVoiceId && (
							<div className="w-[340px] shrink-0 border-l border-border bg-muted/20 rounded-tl-xl">
								<VoiceInspector
									key={selectedVoiceId}
									profileId={selectedVoiceId}
								/>
							</div>
						)}
					</div>
				</TabsContent>
				<TabsContent
					value="reference"
					className="flex-1 overflow-auto p-8 mt-0 data-[state=inactive]:hidden"
				>
					<ReferenceVoicesBrowser />
				</TabsContent>
			</Tabs>

			<ProfileForm />
		</div>
	);
}

interface VoiceRowProps {
	profile: VoiceProfileResponse;
	isSelected: boolean;
	onSelect: () => void;
	channelIds: string[];
	channels: Array<{ id: string; name: string; is_default: boolean }>;
	onChannelChange: (channelIds: string[]) => void;
}

function VoiceRow({
	profile,
	isSelected,
	onSelect,
	channelIds,
	channels,
	onChannelChange,
}: VoiceRowProps) {
	const { t } = useTranslation();
	const serverUrl = useServerStore((state) => state.serverUrl);
	const [avatarError, setAvatarError] = useState(false);
	const avatarUrl = profile.avatar_path
		? `${serverUrl}/profiles/${profile.id}/avatar`
		: null;

	const enabledEffects = profile.effects_chain?.filter((e) => e.enabled) ?? [];
	const effectsSummary = enabledEffects.map((e) => e.type).join(" → ");

	return (
		<TableRow
			className={cn(
				"cursor-pointer transition-colors duration-150",
				isSelected ? "bg-accent/10" : "hover:bg-muted/40",
			)}
			onClick={onSelect}
		>
			<TableCell>
				<div className="flex w-full min-w-0 items-center gap-2">
					<div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
						{avatarUrl && !avatarError ? (
							<img
								src={avatarUrl}
								alt={t("voicesTab.avatarAlt", { name: profile.name })}
								className="h-full w-full object-cover"
								onError={() => setAvatarError(true)}
							/>
						) : (
							<Mic className="size-4 text-muted-foreground" />
						)}
					</div>
					<div className="min-w-0">
						<div className="font-medium truncate">{profile.name}</div>
						{profile.description && (
							<div className="text-sm text-muted-foreground truncate">
								{profile.description}
							</div>
						)}
					</div>
				</div>
			</TableCell>
			<TableCell>{profile.language}</TableCell>
			<TableCell>{profile.generation_count}</TableCell>
			<TableCell>{profile.sample_count}</TableCell>
			<TableCell>
				{enabledEffects.length > 0 ? (
					<span
						className="inline-flex items-center gap-1 text-xs text-accent"
						title={effectsSummary}
					>
						<Sparkles className="size-3 fill-accent" />
						{enabledEffects.length}
					</span>
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				)}
			</TableCell>
			<TableCell onClick={(e) => e.stopPropagation()}>
				<MultiSelect
					options={channels.map((ch) => ({
						value: ch.id,
						label: ch.is_default
							? t("voicesTab.channelDefaultLabel", { name: ch.name })
							: ch.name,
					}))}
					value={channelIds}
					onChange={onChannelChange}
					placeholder={t("voicesTab.selectChannels")}
					className="w-full"
				/>
			</TableCell>
			<TableCell />
		</TableRow>
	);
}
