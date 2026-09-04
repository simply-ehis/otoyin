import { PlayIcon, SignalIcon as Radar } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { GenerationPicker } from "@/components/Effects/GenerationPicker";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { HistoryResponse } from "@/lib/api/types";
import { usePlayerStore } from "@/stores/playerStore";
import { SoundstageRadar } from "./Spatial/SoundstageRadar";
import { SourceControls } from "./Spatial/SourceControls";
import { SpatialControls } from "./Spatial/SpatialControls";
import type { SoundSource } from "./Spatial/types";

const DEFAULT_SOURCES: SoundSource[] = [
	{ id: "1", x: 150, y: 120, label: "Source 1", gain: 1.0, muted: false },
	{ id: "2", x: 250, y: 80, label: "Source 2", gain: 1.0, muted: false },
];

let nextId = 3;

// Radar is 400x300 with the listener at (200,150). Map to spatial x/z in [-1, 1].
function radarToSpatial(x: number, y: number) {
	return {
		x: Math.max(-1, Math.min(1, (x - 200) / 180)),
		z: Math.max(-1, Math.min(1, (y - 150) / 130)),
	};
}

export function SpatialView() {
	const { toast } = useToast();
	const setAudioWithAutoPlay = usePlayerStore((s) => s.setAudioWithAutoPlay);
	const [environment, setEnvironment] = useState("studio_booth");
	const [sources, setSources] = useState<SoundSource[]>(DEFAULT_SOURCES);
	const [dopplerIntensity, setDopplerIntensity] = useState(0);
	const [convolutionMix, setConvolutionMix] = useState(0.3);
	const [binaural, setBinaural] = useState(true);
	const [dragging, setDragging] = useState<string | null>(null);
	const [selected, setSelected] = useState<HistoryResponse | null>(null);
	const [rendering, setRendering] = useState(false);

	const statusQuery = useQuery({
		queryKey: ["spatial-status"],
		queryFn: () => apiClient.getSpatialStatus(),
	});

	const steamAudioAvailable = statusQuery.data?.steam_audio ?? false;

	const handleDragMove = useCallback(
		(x: number, y: number) => {
			if (!dragging) {
				return;
			}
			setSources((prev) =>
				prev.map((s) => (s.id === dragging ? { ...s, x, y } : s)),
			);
		},
		[dragging],
	);

	const addSource = useCallback(() => {
		const id = String(nextId++);
		setSources((prev) => [
			...prev,
			{
				id,
				x: 200,
				y: 150,
				label: `Source ${prev.length + 1}`,
				gain: 1.0,
				muted: false,
			},
		]);
	}, []);

	const removeSource = useCallback((id: string) => {
		setSources((prev) => prev.filter((s) => s.id !== id));
	}, []);

	const toggleMute = useCallback((id: string) => {
		setSources((prev) =>
			prev.map((s) => (s.id === id ? { ...s, muted: !s.muted } : s)),
		);
	}, []);

	const updateGain = useCallback((id: string, gain: number) => {
		setSources((prev) => prev.map((s) => (s.id === id ? { ...s, gain } : s)));
	}, []);

	const handleRender = useCallback(async () => {
		if (!selected?.audio_path) {
			toast({
				title: "No audio selected",
				description: "Choose a generation to spatialize first.",
			});
			return;
		}
		const active = sources.find((s) => !s.muted);
		if (!active) {
			toast({
				title: "No active source",
				description: "Unmute at least one source to render.",
			});
			return;
		}
		const pos = radarToSpatial(active.x, active.y);
		const pan = binaural ? pos : { x: 0, z: 0 };
		setRendering(true);
		try {
			const blob = await apiClient.renderSpatial(
				selected.audio_path,
				{ x: pan.x, y: 0, z: pan.z, distance: active.gain, gain_db: 0.0 },
				environment,
				convolutionMix,
				dopplerIntensity,
			);
			const url = URL.createObjectURL(blob);
			setAudioWithAutoPlay(
				url,
				"spatial-render",
				null,
				`Spatial · ${selected.profile_name}`,
			);
			toast({
				title: "Spatial render complete",
				description: "Now playing the spatialized audio.",
			});
		} catch (err) {
			toast({
				title: "Spatial render failed",
				description:
					err instanceof Error ? err.message : "Could not render spatial audio",
				variant: "destructive",
			});
		} finally {
			setRendering(false);
		}
	}, [
		selected,
		sources,
		environment,
		convolutionMix,
		dopplerIntensity,
		binaural,
		setAudioWithAutoPlay,
		toast,
	]);

	return (
		<div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
			<ScreenHeader
				icon={<Radar className="size-5" />}
				title="3D Spatializer"
				description="Environmental convolution & positioning"
			/>
			<Separator />
			<div className="space-y-1.5">
				<span className="text-xs font-medium block">Source audio</span>
				<GenerationPicker
					selectedId={selected?.id ?? null}
					onSelect={(gen) => setSelected(gen)}
					className="w-full"
				/>
			</div>
			<SpatialControls
				environment={environment}
				onEnvironmentChange={setEnvironment}
				convolutionMix={convolutionMix}
				onConvolutionMixChange={setConvolutionMix}
				dopplerIntensity={dopplerIntensity}
				onDopplerChange={setDopplerIntensity}
				binaural={binaural}
				onBinauralChange={setBinaural}
				steamAudioAvailable={steamAudioAvailable}
			/>
			<Separator />
			<SoundstageRadar
				sources={sources}
				dragging={dragging}
				onDragStart={setDragging}
				onDragMove={handleDragMove}
				onDragEnd={() => setDragging(null)}
			/>
			<SourceControls
				sources={sources}
				onAdd={addSource}
				onRemove={removeSource}
				onToggleMute={toggleMute}
				onUpdateGain={updateGain}
			/>
			<Separator />
			<Button
				onClick={handleRender}
				className="w-full"
				size="sm"
				disabled={rendering}
			>
				{rendering ? (
					<Spinner label="Rendering…" className="mr-2" />
				) : (
					<PlayIcon className="size-4 mr-2" />
				)}
				Apply Spatial Effects
			</Button>
			{statusQuery.isFetching && (
				<Spinner label="Checking engine…" className="text-xs" />
			)}
		</div>
	);
}
