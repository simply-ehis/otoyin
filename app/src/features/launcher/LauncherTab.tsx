/**
 * Clip Launcher Studio, ported from Resonant (© 2026 Calesthio, AGPL-3.0-only).
 * Grid + scenes + transport UI rewritten on otoyin primitives.
 * v1-OUT: arrangement view.
 */
import {
	MusicalNoteIcon,
	PencilSquareIcon,
	PlayIcon,
	PlusIcon,
	StopIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { hueLine } from "@/features/workspace/hueIdentity";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { type InstrumentResolver, liveEngine } from "./engine";
import { StepSequencer } from "./StepSequencer";
import type { Clip, LauncherSession, MidiClip, Track } from "./types";
import {
	useCreateLauncherSession,
	useDeleteLauncherSession,
	useLauncherSessions,
	useUpdateLauncherSession,
} from "./useLauncherSessions";

const sfDataCache = new Map<string, ArrayBuffer>();

function createInstrumentResolver(): InstrumentResolver {
	return async (track) => {
		if (!track.instrumentId) {
			return null;
		}
		try {
			let data = sfDataCache.get(track.instrumentId);
			if (!data) {
				data = await apiClient.getInstrumentPackFile(track.instrumentId);
				sfDataCache.set(track.instrumentId, data);
			}
			const pack = await apiClient.getInstrumentPack(track.instrumentId);
			const inst =
				pack.instruments.find(
					(i) => i.program === (track.instrumentProgram ?? 0) && !i.percussion,
				) ?? pack.instruments[0];
			if (!inst) {
				return null;
			}
			return {
				instrument: {
					id: inst.id,
					name: inst.name,
					format: pack.format as
						| "soundfont"
						| "webaudiofont"
						| "sfz"
						| "sample",
					program: inst.program,
					bankMSB: inst.bankMSB,
					bankLSB: inst.bankLSB,
					percussion: inst.percussion,
					packId: pack.id,
					family: inst.family,
					installed: true,
				},
				data,
			};
		} catch {
			return null;
		}
	};
}

function createDefaultSession(name: string): LauncherSession {
	const now = new Date().toISOString();
	const colors = ["#ff6b86", "#58d6c7", "#9b8cff", "#ffb454", "#63a9ff"];
	const trackDefs: Array<[string, "drum" | "audio"]> = [
		["Drums", "drum"],
		["Audio 1", "audio"],
		["Audio 2", "audio"],
	];
	const tracks: Track[] = [];
	const clips: Record<string, Clip> = {};
	for (let i = 0; i < trackDefs.length; i++) {
		const [trackName, kind] = trackDefs[i];
		const trackId = `track-${Date.now().toString(36)}-${i}`;
		tracks.push({
			id: trackId,
			name: trackName,
			kind,
			color: colors[i % colors.length],
			volume: 0.78,
			pan: 0,
			mute: false,
			solo: false,
			sessionSlots: [null, null, null, null],
		});
	}
	return {
		id: "",
		name,
		bpm: 120,
		masterVolume: 0.84,
		tracks,
		clips,
		numScenes: 4,
		createdAt: now,
		modifiedAt: now,
	};
}

function formatBeat(beat: number): string {
	const bar = Math.floor(beat / 4) + 1;
	const step = Math.floor(beat % 4) + 1;
	return `${bar}.${step}`;
}

export function LauncherTab() {
	const { t } = useTranslation();
	const { toast } = useToast();

	const { data: sessions } = useLauncherSessions();
	const createSession = useCreateLauncherSession();
	const updateSession = useUpdateLauncherSession();
	const deleteSession = useDeleteLauncherSession();

	const [activeId, setActiveId] = useState<string | null>(null);
	const [session, setSession] = useState<LauncherSession>(() =>
		createDefaultSession("Untitled session"),
	);
	const [activeClips, setActiveClips] = useState<Record<string, string | null>>(
		{},
	);
	const [playing, setPlaying] = useState(false);
	const [beat, setBeat] = useState(0);
	const [dirty, setDirty] = useState(false);
	const [editingClipId, setEditingClipId] = useState<string | null>(null);

	const animRef = useRef(0);

	const tick = useCallback(() => {
		if (liveEngine.isPlaying()) {
			setBeat(liveEngine.getCurrentBeat());
			animRef.current = requestAnimationFrame(tick);
		}
	}, []);

	useEffect(() => {
		return () => cancelAnimationFrame(animRef.current);
	}, []);

	const togglePlay = useCallback(async () => {
		if (playing) {
			liveEngine.stop();
			setPlaying(false);
			cancelAnimationFrame(animRef.current);
		} else {
			await liveEngine.play(session, activeClips, createInstrumentResolver());
			setPlaying(true);
			animRef.current = requestAnimationFrame(tick);
		}
	}, [playing, session, activeClips, tick]);

	const launchClip = useCallback((trackId: string, clipId: string | null) => {
		setActiveClips((prev) => {
			const next = { ...prev, [trackId]: clipId };
			liveEngine.setActiveClips(next);
			return next;
		});
	}, []);

	const launchScene = useCallback(
		(scene: number) => {
			const next: Record<string, string | null> = { ...activeClips };
			for (const track of session.tracks) {
				const clipId = track.sessionSlots[scene] ?? null;
				next[track.id] = clipId;
			}
			setActiveClips(next);
			liveEngine.setActiveClips(next);
			if (!playing) {
				void togglePlay();
			}
			toast({
				title: t("launcher.sceneLaunched", {
					defaultValue: `Scene ${scene + 1} launched`,
				}),
			});
		},
		[activeClips, session.tracks, playing, togglePlay, toast, t],
	);

	const loadSession = useCallback(
		(id: string) => {
			const found = sessions?.find((s) => s.id === id);
			if (!found) {
				return;
			}
			setActiveId(id);
			const tracks: Track[] = found.session.tracks.map((t) => ({
				...t,
				kind: t.kind as Track["kind"],
			}));
			setSession({
				id: found.id,
				name: found.name,
				bpm: found.session.bpm,
				masterVolume: found.session.masterVolume,
				tracks,
				clips: found.session.clips as LauncherSession["clips"],
				numScenes: found.session.numScenes,
				createdAt: found.createdAt,
				modifiedAt: found.updatedAt,
			});
			setActiveClips({});
			setDirty(false);
		},
		[sessions],
	);

	const save = useCallback(() => {
		const body = {
			name: session.name,
			session: {
				name: session.name,
				bpm: session.bpm,
				masterVolume: session.masterVolume,
				tracks: session.tracks,
				clips: session.clips,
				numScenes: session.numScenes,
			},
		};
		if (activeId) {
			updateSession.mutate(
				{ sessionId: activeId, data: body },
				{
					onSuccess: () => {
						setDirty(false);
						toast({
							title: t("launcher.toast.saved", {
								defaultValue: "Session saved",
							}),
						});
					},
					onError: (e: unknown) => showStudioErrorToast(e),
				},
			);
		} else {
			createSession.mutate(body, {
				onSuccess: (created) => {
					setActiveId(created.id);
					setDirty(false);
					toast({
						title: t("launcher.toast.saved", {
							defaultValue: "Session saved",
						}),
					});
				},
				onError: (e: unknown) => showStudioErrorToast(e),
			});
		}
	}, [session, activeId, updateSession, createSession, toast, t]);

	const removeSession = useCallback(() => {
		if (!activeId) {
			return;
		}
		deleteSession.mutate(activeId, {
			onSuccess: () => {
				setActiveId(null);
				setSession(createDefaultSession("Untitled session"));
				setActiveClips({});
				setDirty(false);
			},
			onError: (e: unknown) => showStudioErrorToast(e),
		});
	}, [activeId, deleteSession]);

	const captureToStory = useCallback(async () => {
		if (!activeId) {
			toast({
				variant: "destructive",
				title: t("launcher.toast.noSession", {
					defaultValue: "Save the session first",
				}),
			});
			return;
		}
		try {
			const result = await apiClient.captureLauncherSession(
				activeId,
				activeClips,
			);
			const gen = await apiClient.createGenerationFromAudio(
				result.audioPath,
				`Launcher: ${session.name}`,
			);
			toast({
				title: t("launcher.toast.captured", {
					defaultValue: "Captured to library",
				}),
				description: `${result.durationS.toFixed(1)}s bounced — add it to any story from the library.`,
			});
			return gen;
		} catch (e: unknown) {
			showStudioErrorToast(e);
			return null;
		}
	}, [activeId, activeClips, session.name, toast, t]);

	const updateBpm = useCallback((value: string) => {
		const bpm = Math.max(30, Math.min(300, Number(value) || 120));
		setSession((s) => ({ ...s, bpm }));
		setDirty(true);
	}, []);

	return (
		<div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
			<ScreenHeader
				title={t("launcher.title", { defaultValue: "Clip Launcher" })}
				actions={
					<div className="flex items-center gap-2">
						<Select
							value={activeId ?? "_new"}
							onValueChange={(value) => {
								if (value === "_new") {
									setActiveId(null);
									setSession(createDefaultSession("Untitled session"));
									setActiveClips({});
									setDirty(false);
								} else {
									loadSession(value);
								}
							}}
						>
							<SelectTrigger
								className="h-8 w-44 text-xs"
								aria-label={t("launcher.session", {
									defaultValue: "Session",
								})}
							>
								<SelectValue
									placeholder={t("launcher.newSession", {
										defaultValue: "New session",
									})}
								/>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="_new">
									{t("launcher.newSession", {
										defaultValue: "New session",
									})}
								</SelectItem>
								{(sessions ?? []).map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.name || "Untitled"}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={
								!dirty || createSession.isPending || updateSession.isPending
							}
							onClick={save}
						>
							{t("common.save", { defaultValue: "Save" })}
							{dirty ? " ·" : ""}
						</Button>
						{activeId ? (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={deleteSession.isPending}
								onClick={removeSession}
							>
								{t("common.delete", { defaultValue: "Delete" })}
							</Button>
						) : null}
					</div>
				}
			/>

			{/* Transport bar */}
			<div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
				<Button
					type="button"
					size="sm"
					variant={playing ? "destructive" : "default"}
					onClick={() => void togglePlay()}
					aria-label={playing ? "Stop" : "Play"}
				>
					{playing ? (
						<StopIcon className="size-4" aria-hidden="true" />
					) : (
						<PlayIcon className="size-4" aria-hidden="true" />
					)}
				</Button>
				<div className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
					<MusicalNoteIcon className="size-3.5" aria-hidden="true" />
					<span className="font-mono text-sm font-medium text-foreground">
						{formatBeat(beat)}
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<label
						className="text-xs text-muted-foreground"
						htmlFor="launcher-bpm"
					>
						BPM
					</label>
					<Input
						id="launcher-bpm"
						type="number"
						min={30}
						max={300}
						value={session.bpm}
						onChange={(e) => updateBpm(e.target.value)}
						className="h-7 w-16 text-xs tabular-nums"
					/>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => void captureToStory()}
						disabled={!activeId}
						title={t("launcher.capture", {
							defaultValue: "Bounce to library",
						})}
					>
						<MusicalNoteIcon className="size-3.5" aria-hidden="true" />
						{t("launcher.capture", { defaultValue: "Capture" })}
					</Button>
					<div className="text-xs text-muted-foreground">
						{session.tracks.length}{" "}
						{t("launcher.tracks", { defaultValue: "tracks" })}
					</div>
				</div>
			</div>

			{/* Session grid */}
			<div className="overflow-x-auto rounded-md border border-border bg-card">
				<div
					className="grid"
					style={{
						gridTemplateColumns: `70px repeat(${session.tracks.length}, minmax(120px, 1fr))`,
					}}
				>
					{/* Header row */}
					<div className="border-b border-border bg-muted/50 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						Scenes
					</div>
					{session.tracks.map((track) => (
						<div
							key={track.id}
							className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-2 py-1.5"
						>
							<span
								className="size-2 shrink-0 rounded-full"
								style={{ background: track.color }}
							/>
							<span className="truncate text-xs font-medium">{track.name}</span>
						</div>
					))}

					{/* Scene rows */}
					{Array.from({ length: session.numScenes }, (_, scene) => (
						<SceneRow
							// biome-ignore lint/suspicious/noArrayIndexKey: stable scene index, never reordered
							key={scene}
							scene={scene}
							tracks={session.tracks}
							clips={session.clips}
							activeClips={activeClips}
							onLaunchScene={launchScene}
							onLaunchClip={launchClip}
							onEditClip={setEditingClipId}
						/>
					))}
				</div>
			</div>

			{editingClipId && session.clips[editingClipId]?.type === "midi" ? (
				<div className="rounded-md border border-border bg-card p-3">
					<div className="mb-2 flex items-center justify-between">
						<span className="text-xs font-medium">
							Editing: {session.clips[editingClipId].name}
						</span>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => setEditingClipId(null)}
						>
							Close
						</Button>
					</div>
					<StepSequencer
						clip={session.clips[editingClipId] as MidiClip}
						onChange={(notes) => {
							setSession((prev) => ({
								...prev,
								clips: {
									...prev.clips,
									[editingClipId]: {
										...prev.clips[editingClipId],
										notes,
									} as MidiClip,
								},
							}));
							setDirty(true);
						}}
						className="max-h-80"
					/>
				</div>
			) : null}
		</div>
	);
}

function SceneRow({
	scene,
	tracks,
	clips,
	activeClips,
	onLaunchScene,
	onLaunchClip,
	onEditClip,
}: {
	scene: number;
	tracks: Track[];
	clips: Record<string, Clip>;
	activeClips: Record<string, string | null>;
	onLaunchScene: (scene: number) => void;
	onLaunchClip: (trackId: string, clipId: string | null) => void;
	onEditClip: (clipId: string) => void;
}) {
	return (
		<>
			<button
				type="button"
				className={`flex items-center justify-center gap-1 border-b px-2 py-2 text-xs font-medium transition-colors hover:bg-accent ${hueLine(scene)}`}
				onClick={() => onLaunchScene(scene)}
			>
				<PlayIcon className="size-3" aria-hidden="true" />
				{String(scene + 1).padStart(2, "0")}
			</button>
			{tracks.map((track) => {
				const clipId = track.sessionSlots[scene] ?? null;
				const clip = clipId ? clips[clipId] : undefined;
				const active = !!clipId && activeClips[track.id] === clipId;
				return (
					<button
						key={track.id}
						type="button"
						className={`group relative flex flex-col items-center justify-center gap-0.5 border-b border-border px-2 py-2 text-left transition-colors ${
							active
								? "bg-primary/10 ring-1 ring-primary/40"
								: clip
									? "hover:bg-accent"
									: "border-dashed opacity-50"
						}`}
						onClick={() => {
							if (clip) {
								onLaunchClip(track.id, clip.id);
							}
						}}
					>
						{clip ? (
							<>
								<span className="truncate text-xs font-medium">
									{clip.name}
								</span>
								<span className="text-[10px] text-muted-foreground">
									{clip.type === "audio"
										? `${clip.lengthBeats} beats`
										: `${(clip.notes ?? []).length} notes`}
								</span>
								{clip.type === "midi" ? (
									<button
										type="button"
										className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
										title="Edit MIDI"
										aria-label={`Edit ${clip.name}`}
										onClick={(e) => {
											e.stopPropagation();
											onEditClip(clip.id);
										}}
									>
										<PencilSquareIcon className="size-3" aria-hidden="true" />
									</button>
								) : null}
								{active && (
									<span className="text-[10px] font-medium text-primary">
										LIVE
									</span>
								)}
							</>
						) : (
							<span className="text-[10px] text-muted-foreground">
								<PlusIcon className="mx-auto size-3" aria-hidden="true" />
								EMPTY
							</span>
						)}
					</button>
				);
			})}
		</>
	);
}
