import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { SessionResponse } from "@/lib/api/types";
import { getClip } from "@/lib/clip";
import { ERR_DESC_MIX_FAILED, ERR_TITLE_MIX } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, ErrorState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { ChannelCard } from "./mixer/ChannelCard";
import { MasterCard } from "./mixer/MasterCard";
import type { ChannelState } from "./mixer/mixerTypes";
import { toMixerState } from "./mixer/mixerTypes";
import {
	removeChannel as removeChannelUtil,
	restoreSession as restoreSessionUtil,
	updateChannel as updateChannelUtil,
} from "./mixer/mixerUtils";
import { playPreviewBlob } from "./playBlob";

export function MixerView() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [channels, setChannels] = useState<ChannelState[]>([]);
	const [masterVolume, setMasterVolume] = useState(0.8);
	const [masterLevel, setMasterLevel] = useState(0);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [isAutosave, setIsAutosave] = useState(false);
	const [unsaved, setUnsaved] = useState(false);
	const [selectedSession, setSelectedSession] = useState("");
	const meterTimer = useRef<number | null>(null);

	const sessionsQuery = useQuery({
		queryKey: ["mixer-sessions"],
		queryFn: () => apiClient.listMixerSessions(),
	});

	useEffect(() => {
		function handleBeforeUnload(e: BeforeUnloadEvent) {
			if (unsaved) {
				e.preventDefault();
				e.returnValue = "";
			}
		}
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [unsaved]);

	useEffect(() => {
		if (sessionId === null || channels.length === 0) {
			return;
		}
		setUnsaved(true);
		const handle = setTimeout(async () => {
			const data = toMixerState(channels, masterVolume);
			try {
				if (isAutosave) {
					await apiClient.updateMixerSession(sessionId, data);
				} else {
					const created = await apiClient.createMixerSession(
						"Mix Autosave",
						data,
						true,
					);
					setSessionId(created.id);
					setIsAutosave(true);
				}
			} catch {
				/* autosave is best-effort */
			}
		}, 1500);
		return () => clearTimeout(handle);
	}, [channels, masterVolume, sessionId, isAutosave]);

	useEffect(() => {
		return () => {
			if (meterTimer.current !== null) {
				window.clearInterval(meterTimer.current);
			}
		};
	}, []);

	function handleUpdateChannel(id: string, updates: Partial<ChannelState>) {
		setChannels((prev) => updateChannelUtil(prev, id, updates));
	}

	function handleRemoveChannel(id: string) {
		setChannels((prev) => removeChannelUtil(prev, id));
	}

	const pasteClip = useCallback(async () => {
		let clip: Awaited<ReturnType<typeof getClip>> = null;
		try {
			clip = await getClip();
		} catch {
			return;
		}
		if (!clip) {
			return;
		}
		setChannels((prev) => [
			...prev,
			{
				id: `ch-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
				name: clip.name.slice(0, 24) || `Clip ${prev.length + 1}`,
				volume: 0.75,
				pan: 0,
				muted: false,
				soloed: false,
				clipId: clip.id,
				audioUrl: clip.audioUrl,
			},
		]);
	}, []);

	function handleRestoreSession(session: SessionResponse) {
		const { channels: restored, masterVolume: mv } =
			restoreSessionUtil(session);
		setChannels(restored);
		setMasterVolume(mv);
		setSessionId(session.id);
		setIsAutosave(session.is_autosave);
		setUnsaved(false);
	}

	async function loadSelectedSession() {
		if (!selectedSession) {
			return;
		}
		try {
			const session = await apiClient.getMixerSession(selectedSession);
			handleRestoreSession(session);
			toast({ title: "Session loaded", description: session.name });
		} catch (err) {
			showStudioErrorToast(err);
		}
	}

	async function deleteSelectedSession() {
		if (!selectedSession) {
			return;
		}
		try {
			await apiClient.deleteMixerSession(selectedSession);
			if (sessionId === selectedSession) {
				setSessionId(null);
				setIsAutosave(false);
			}
			setSelectedSession("");
			await queryClient.invalidateQueries({ queryKey: ["mixer-sessions"] });
		} catch (err) {
			showStudioErrorToast(err);
		}
	}

	async function handleSaveSession() {
		if (channels.length === 0) {
			return;
		}
		const data = toMixerState(channels, masterVolume);
		const name = `${new Date().toLocaleString()} Mix`;
		try {
			if (sessionId !== null) {
				if (isAutosave) {
					await apiClient.promoteMixerSession(sessionId, name, data);
				} else {
					await apiClient.updateMixerSession(sessionId, data);
				}
			} else {
				const created = await apiClient.createMixerSession(name, data);
				setSessionId(created.id);
			}
			setIsAutosave(false);
			setUnsaved(false);
			await queryClient.invalidateQueries({ queryKey: ["mixer-sessions"] });
		} catch (err) {
			showStudioErrorToast(err);
		}
	}

	const previewMut = useMutation({
		mutationFn: () =>
			apiClient.mixPreview({
				story_id: "",
				mixer_state: toMixerState(channels, masterVolume),
			}),
		onSuccess: (blob) => {
			const audio = playPreviewBlob(blob);
			try {
				const Ctx =
					window.AudioContext ??
					(window as unknown as { webkitAudioContext?: typeof AudioContext })
						.webkitAudioContext;
				if (!Ctx) {
					return;
				}
				const ctx = new Ctx();
				const source = ctx.createMediaElementSource(audio);
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 256;
				source.connect(analyser);
				analyser.connect(ctx.destination);
				const bins = new Uint8Array(analyser.frequencyBinCount);
				meterTimer.current = window.setInterval(() => {
					analyser.getByteTimeDomainData(bins);
					let peak = 0;
					for (const v of bins) {
						const d = Math.abs(v - 128) / 128;
						if (d > peak) {
							peak = d;
						}
					}
					setMasterLevel(Math.min(1, peak));
				}, 100);
				audio.onended = () => {
					if (meterTimer.current !== null) {
						window.clearInterval(meterTimer.current);
						meterTimer.current = null;
					}
					setMasterLevel(0);
					void ctx.close();
				};
			} catch {
				/* meters are best-effort; playback already started */
			}
		},
		onError: () =>
			toast({
				title: ERR_TITLE_MIX,
				description: ERR_DESC_MIX_FAILED,
				variant: "destructive",
			}),
	});

	const sessions = sessionsQuery.data ?? [];

	return (
		<div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
			<ScreenHeader
				title="Mixer"
				actions={
					<>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={pasteClip}
							title="Paste clip as channel"
							aria-label="Paste clip as channel"
						>
							Paste Clip
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={channels.length === 0}
							onClick={() => void handleSaveSession()}
							title="Save mix session"
							aria-label={
								unsaved
									? "Save mix session, unsaved changes"
									: "Save mix session"
							}
						>
							Save
							{unsaved && (
								<span
									aria-hidden="true"
									title="Unsaved changes"
									className="ml-1 inline-block size-1.5 rounded-full bg-warning"
								/>
							)}
						</Button>
					</>
				}
			/>

			{sessionsQuery.isLoading ? (
				<output aria-label="Loading sessions" className="flex flex-col gap-2">
					<div
						aria-hidden="true"
						className="h-9 animate-pulse rounded-md bg-secondary"
					/>
				</output>
			) : sessionsQuery.isError ? (
				<ErrorState
					title="Sessions couldn't load"
					body="Saving still works for this mix; saved sessions are unavailable."
					onRetry={() => void sessionsQuery.refetch()}
				/>
			) : sessions.length > 0 ? (
				<div className="flex flex-wrap items-center gap-2">
					<Select value={selectedSession} onValueChange={setSelectedSession}>
						<SelectTrigger
							className="h-8 min-w-44 flex-1 text-xs sm:flex-none"
							aria-label="Saved mix sessions"
						>
							<SelectValue placeholder="Load a saved session" />
						</SelectTrigger>
						<SelectContent>
							{sessions.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-8 text-xs"
						disabled={!selectedSession}
						onClick={() => void loadSelectedSession()}
					>
						Load
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="h-8 text-xs"
						disabled={!selectedSession}
						title="Delete the selected saved session"
						aria-label="Delete the selected saved session"
						onClick={() => void deleteSelectedSession()}
					>
						Delete
					</Button>
				</div>
			) : null}

			{channels.length === 0 ? (
				<EmptyState
					title="No channels yet"
					body="Paste a clip from the audio clipboard, or load a saved session to start mixing."
					action={
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => void pasteClip()}
						>
							Paste Clip
						</Button>
					}
				/>
			) : (
				<div className="flex flex-wrap gap-3">
					{channels.map((ch) => (
						<ChannelCard
							key={ch.id}
							ch={ch}
							onUpdate={handleUpdateChannel}
							onRemove={handleRemoveChannel}
						/>
					))}
				</div>
			)}

			<MasterCard
				masterVolume={masterVolume}
				masterLevel={masterLevel}
				onMasterVolumeChange={setMasterVolume}
				channelsLength={channels.length}
				previewMut={previewMut}
			/>
		</div>
	);
}
