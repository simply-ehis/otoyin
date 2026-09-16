import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { useToast } from "@/ui/use-toast";
import type { StudioTrack } from "./AudioStudioStore";
import { toBackendChain } from "./effectChainAdapter";
import { trackToWavBase64 } from "./trackToWavBase64";

interface UsePluginExportOptions {
	tracks: StudioTrack[];
	masterVolume: number;
}

export function usePluginExport({
	tracks,
	masterVolume,
}: UsePluginExportOptions) {
	const { toast } = useToast();
	const [exportWithPlugins, setExportWithPlugins] = useState(false);

	const handleExportWithPlugins = useCallback(async () => {
		setExportWithPlugins(true);
		try {
			const api = apiClient;

			const activeTracks = tracks.filter(
				(t) => t.audioUrl || t.audioBlob || t.midiNotes.length > 0,
			);
			if (activeTracks.length === 0) {
				toast({
					title: "No audio to export",
					description: "No tracks with audio or MIDI content",
				});
				setExportWithPlugins(false);
				return;
			}

			const trackConfigs = (
				await Promise.all(
					activeTracks.map(async (track) => {
						const audioData =
							track.audioUrl || track.audioBlob
								? await trackToWavBase64(track)
								: null;
						const hasSolo = tracks.some((t) => t.solo);
						const isMuted = hasSolo ? !track.solo : track.muted;
						// Translate panel params (registry dialect) to the render
						// engine dialect; frontend-only entries are dropped.
						const { chain: backendChain } = toBackendChain(
							track.pluginChain ?? [],
						);
						const crossfadeTargetIndex =
							track.crossfade?.targetTrackId != null
								? tracks.findIndex(
										(t) => t.id === track.crossfade?.targetTrackId,
									)
								: -1;

						return {
							audio_data: audioData ?? undefined,
							midi_notes: track.midiNotes,
							instrument: "piano",
							note_duration: track.duration || 1.0,
							volume: track.volume,
							pan: track.pan,
							muted: isMuted,
							solo: track.solo,
							plugin_chain: backendChain.map((p) => ({
								plugin_id: `builtin-${p.effect_type}`,
								plugin_name: p.effect_type,
								enabled: p.enabled,
								params: p.params,
							})),
							volume_automation: track.volumeAutomation,
							pan_automation: track.panAutomation,
							crossfade_target:
								crossfadeTargetIndex >= 0 ? crossfadeTargetIndex : null,
							crossfade_ms: track.crossfade?.durationMs ?? 0,
							channels: track.channels || 2,
						};
					}),
				)
			).filter((c): c is NonNullable<typeof c> => c !== null);

			if (trackConfigs.length === 0) {
				toast({
					title: "No audio to export",
					description: "Track audio could not be read",
				});
				setExportWithPlugins(false);
				return;
			}

			const blob = await api.bounceTracks({
				tracks: trackConfigs,
				sample_rate: 44100,
				master_volume: masterVolume,
			});

			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "audio-studio-export-with-plugins.wav";
			a.click();
			URL.revokeObjectURL(url);

			toast({
				title: "Export with plugins complete",
				description: "Mixed audio with full effect chain downloaded",
			});
		} catch (err) {
			toast({
				title: "Export failed",
				description:
					err instanceof Error ? err.message : "Failed to export with plugins",
				variant: "destructive",
			});
		}
		setExportWithPlugins(false);
	}, [tracks, masterVolume, toast]);

	return { handleExportWithPlugins, exportWithPlugins };
}
