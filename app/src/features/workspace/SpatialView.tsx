import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { HistoryResponse } from "@/lib/api/types";
import { Button } from "@/ui/button";
import { Separator, Spinner } from "@/ui/primitives";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { playPreviewBlob } from "./playBlob";
import { GenerationPicker } from "./spatial/GenerationPicker";
import { SoundstageRadar } from "./spatial/SoundstageRadar";
import { SourceControls } from "./spatial/SourceControls";
import { SpatialControls } from "./spatial/SpatialControls";
import type { SoundSource } from "./spatial/types";

// Radar is 400x300 with the listener at (200,150). Map to spatial x/z in [-1, 1].
function radarToSpatial(x: number, y: number) {
	return {
		x: Math.max(-1, Math.min(1, (x - 200) / 180)),
		z: Math.max(-1, Math.min(1, (y - 150) / 130)),
	};
}

export function SpatialView() {
	const { toast } = useToast();
	const [environment, setEnvironment] = useState("studio_booth");
	const [sources, setSources] = useState<SoundSource[]>([]);
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
		const id = `src-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
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

	async function handleRender() {
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
				description: "Add a source and unmute at least one to render.",
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
			playPreviewBlob(blob);
			toast({
				title: "Spatial render complete",
				description: `Rendered at (${pan.x.toFixed(2)}, ${pan.z.toFixed(2)}).`,
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
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="3D Spatializer" />

			<Separator />

			<div className="max-w-xl space-y-1">
				<span className="text-xs font-medium text-foreground">
					Source audio
				</span>
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

			{sources.length === 0 ? (
				<EmptyState
					title="No sources yet"
					body="Add a source, drag it around the listener, then render."
					action={
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={addSource}
						>
							Add Source
						</Button>
					}
				/>
			) : (
				<>
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
				</>
			)}

			<Separator />

			<div>
				<Button
					type="button"
					size="sm"
					className="w-full"
					disabled={rendering || !selected || sources.length === 0}
					title="Render positioned spatial audio"
					aria-label="Apply spatial effects"
					onClick={() => void handleRender()}
				>
					{rendering ? <Spinner size="xs" className="mr-2" /> : null}
					{rendering ? "Rendering…" : "Apply Spatial Effects"}
				</Button>
			</div>
		</div>
	);
}
