import { Bars3Icon as GripHorizontal } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import StudioVisualizer from "@/components/Studio/StudioVisualizer";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { getClip } from "@/lib/clip";
import { ERR_DESC_MIX_FAILED, ERR_TITLE_MIX } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";

interface ChannelStrip {
	id: string;
	name: string;
	volume: number;
	pan: number;
	muted: boolean;
	soloed: boolean;
	vuLevel: number;
	clipId?: string;
	audioUrl?: string;
}

function ChannelStripView({
	ch,
	onUpdate,
}: {
	ch: ChannelStrip;
	onUpdate: (id: string, updates: Partial<ChannelStrip>) => void;
}) {
	const [volume, setVolume] = useState(ch.volume);
	const [muted, setMuted] = useState(ch.muted);
	const [soloed, setSoloed] = useState(ch.soloed);
	const vuPercent = Math.min(100, ch.vuLevel * 100);

	function handleVolume(v: number) {
		setVolume(v);
		onUpdate(ch.id, { volume: v });
	}
	function handleMute() {
		const next = !muted;
		setMuted(next);
		onUpdate(ch.id, { muted: next });
	}
	function handleSolo() {
		const next = !soloed;
		setSoloed(next);
		onUpdate(ch.id, { soloed: next });
	}

	return (
		<div className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border bg-card min-w-[80px]">
			<span className="text-xs font-medium text-foreground truncate max-w-full">
				{ch.name}
			</span>

			{/* VU meter */}
			<div className="w-3 h-24 rounded-full bg-secondary overflow-hidden relative">
				<div
					className="absolute bottom-0 w-full rounded-full transition-[height,background-color]"
					style={{
						height: `${vuPercent}%`,
						background:
							vuPercent > 80
								? "hsl(var(--destructive))"
								: vuPercent > 60
									? "hsl(48, 96%, 53%)"
									: "hsl(var(--accent))",
					}}
				/>
			</div>

			{/* Pan indicator */}
			<div className="flex items-center gap-1">
				<span className="text-xs text-muted-foreground w-3 text-right">
					L
				</span>
				<div className="w-12 h-1 rounded-full bg-secondary relative">
					<div
						className="absolute top-1/2 -translate-y-1/2 size-2 rounded-full bg-accent transition-[left]"
						style={{ left: `${((ch.pan + 1) / 2) * 100}%`, marginLeft: -4 }}
					/>
				</div>
				<span className="text-xs text-muted-foreground w-3">R</span>
			</div>

			{/* Volume slider */}
			<Slider
				min={0}
				max={1}
				step={0.01}
				value={[volume]}
				onValueChange={([v]) => handleVolume(v)}
				className="h-20 [&>div]:h-full [&>div]:flex-col [&>div]:items-center"
			/>

			{/* Mute / Solo */}
			<div className="flex gap-1">
				<button
					type="button"
					className={cn(
						"px-1.5 py-0.5 text-xs font-bold rounded transition-colors",
						muted
							? "bg-destructive/20 text-destructive"
							: "bg-muted text-muted-foreground hover:bg-muted/80",
					)}
					title={muted ? "Unmute" : "Mute"}
					aria-label={muted ? "Unmute" : "Mute"}
					onClick={handleMute}
				>
					M
				</button>
				<button
					type="button"
					className={cn(
						"px-1.5 py-0.5 text-xs font-bold rounded transition-colors",
						soloed
							? "bg-accent/20 text-accent"
							: "bg-muted text-muted-foreground hover:bg-muted/80",
					)}
					title={soloed ? "Unsolo" : "Solo"}
					aria-label={soloed ? "Unsolo" : "Solo"}
					onClick={handleSolo}
				>
					S
				</button>
			</div>
		</div>
	);
}

export function MixerView() {
	const { toast } = useToast();
	const [channels, setChannels] = useState<ChannelStrip[]>([
		{
			id: "1",
			name: "Voice 1",
			volume: 0.75,
			pan: 0,
			muted: false,
			soloed: false,
			vuLevel: 0.45,
		},
		{
			id: "2",
			name: "Voice 2",
			volume: 0.6,
			pan: -0.3,
			muted: false,
			soloed: true,
			vuLevel: 0.3,
		},
		{
			id: "3",
			name: "BG Music",
			volume: 0.4,
			pan: 0.5,
			muted: false,
			soloed: false,
			vuLevel: 0.6,
		},
		{
			id: "4",
			name: "SFX",
			volume: 0.5,
			pan: -0.5,
			muted: true,
			soloed: false,
			vuLevel: 0,
		},
	]);
	const [masterVolume, setMasterVolume] = useState(0.8);

	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [isAutosave, setIsAutosave] = useState(false);
	const [unsaved, setUnsaved] = useState(false);

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
		if (currentSessionId === null) {
			return;
		}
		setUnsaved(true);
		const handle = setTimeout(async () => {
			try {
				const data = {
					masterVolume,
					channels: channels.map(({ vuLevel: _vuLevel, ...rest }) => rest),
				};
				if (isAutosave) {
					await apiClient.updateMixerSession(currentSessionId, data);
				} else {
					const created = await apiClient.createMixerSession(
						"Mix Autosave",
						data,
						true,
					);
					setCurrentSessionId(created.id);
					setIsAutosave(true);
				}
			} catch {
				/* autosave is best-effort */
			}
		}, 1500);
		return () => clearTimeout(handle);
	}, [channels, masterVolume, currentSessionId, isAutosave]);

	const handleSaveSession = useCallback(async () => {
		const data = {
			masterVolume,
			channels: channels.map(({ vuLevel: _vuLevel, ...rest }) => rest),
		};
		const name = `${new Date().toLocaleString()} Mix`;
		try {
			if (currentSessionId !== null) {
				if (isAutosave) {
					await apiClient.promoteMixerSession(currentSessionId, name, data);
				} else {
					await apiClient.updateMixerSession(currentSessionId, data);
				}
			} else {
				const created = await apiClient.createMixerSession(name, data);
				setCurrentSessionId(created.id);
			}
			setIsAutosave(false);
			setUnsaved(false);
		} catch {
			/* save failure should keep the unsaved badge */
		}
	}, [channels, masterVolume, currentSessionId, isAutosave]);

	function updateChannel(id: string, updates: Partial<ChannelStrip>) {
		setChannels((prev) =>
			prev.map((ch) => (ch.id === id ? { ...ch, ...updates } : ch)),
		);
	}

	const pasteClip = useCallback(async () => {
		let clip: import("@/lib/clip").Clip | null = null;
		try {
			clip = await getClip();
		} catch {
			return;
		}
		if (!clip) {
			return;
		}
		const id = String(channels.length + 1);
		setChannels((prev) => [
			...prev,
			{
				id,
				name: clip.name.slice(0, 16) || `Clip ${prev.length + 1}`,
				volume: 0.75,
				pan: 0,
				muted: false,
				soloed: false,
				vuLevel: 0,
				clipId: clip.id,
				audioUrl: clip.audioUrl,
			},
		]);
	}, [channels.length]);

	const previewMut = useMutation({
		mutationFn: () =>
			apiClient.mixPreview({
				story_id: "",
				mixer_state: {
					tracks: channels.map((ch) => ({
						id: ch.id,
						name: ch.name,
						volume: ch.volume,
						pan: ch.pan,
						muted: ch.muted,
						solo: ch.soloed,
					})),
					buses: [
						{ id: "dialogue", name: "Dialogue", volume: 0, pan: 0 },
						{ id: "music", name: "Music", volume: -6, pan: 0 },
						{ id: "sfx", name: "SFX", volume: -3, pan: 0 },
					],
					master_volume: masterVolume,
				},
			}),
	});

	return (
		<div className="flex flex-col h-full p-4 gap-3 overflow-hidden">
			<ScreenHeader
				icon={<GripHorizontal className="size-5" />}
				title="Mixer"
				description="Balance channel strips & levels"
				actions={
					<>
						<Button
							size="sm"
							variant="outline"
							onClick={handleSaveSession}
							title="Save mix session"
							aria-label="Save mix session"
						>
							Save
							{unsaved && (
								<span
									role="img"
									className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
									title="Unsaved changes — Save to name this session"
									aria-label="Unsaved changes"
								/>
							)}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={pasteClip}
							title="Paste clip as channel"
							aria-label="Paste clip as channel"
						>
							Paste Clip
						</Button>
					</>
				}
			/>
			<StudioVisualizer className="w-full shrink-0" />
			{/* Channel strips */}
			<div className="flex gap-3 flex-1 overflow-x-auto">
				{channels.map((ch) => (
					<ChannelStripView key={ch.id} ch={ch} onUpdate={updateChannel} />
				))}
			</div>

			{/* Master channel */}
			<div className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 border-accent/30 bg-card min-w-[90px]">
				<GripHorizontal className="size-4 text-muted-foreground" />
				<span className="text-xs font-bold text-accent uppercase">
					Master
				</span>

				{/* Master VU */}
				<div className="w-3 h-28 rounded-full bg-secondary overflow-hidden relative">
					<div
						className="absolute bottom-0 w-full rounded-full bg-accent transition-[height]"
						style={{ height: `${masterVolume * 70}%` }}
					/>
				</div>

				<div className="flex items-center gap-1">
					<span className="text-xs text-muted-foreground w-3 text-right">
						L
					</span>
					<div className="w-12 h-1 rounded-full bg-secondary relative">
						<div
							className="absolute top-1/2 -translate-y-1/2 size-2 rounded-full bg-accent"
							style={{ left: "50%", marginLeft: -4 }}
						/>
					</div>
					<span className="text-xs text-muted-foreground w-3">R</span>
				</div>

				<Slider
					min={0}
					max={1}
					step={0.01}
					value={[masterVolume]}
					onValueChange={([v]) => setMasterVolume(v)}
					className="h-24 [&>div]:h-full [&>div]:flex-col [&>div]:items-center"
				/>

				<Button
					variant="outline"
					size="sm"
					className="h-7 text-xs w-full"
					disabled={previewMut.isPending}
					title="Preview mix"
					aria-label="Preview mix"
					onClick={() =>
						previewMut.mutate(undefined, {
							onSuccess: (blob) => {
								const url = URL.createObjectURL(blob);
								const a = new Audio(url);
								a.play().catch((err) => {
									URL.revokeObjectURL(url);
									showStudioErrorToast(err);
								});
								a.onended = () => URL.revokeObjectURL(url);
							},
							onError: () =>
								toast({
									title: ERR_TITLE_MIX,
									description: ERR_DESC_MIX_FAILED,
									variant: "destructive",
								}),
						})
					}
				>
					{previewMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					Preview
				</Button>
			</div>
		</div>
	);
}
