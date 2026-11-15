import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/ui/button";
import { Label, Separator, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { Toggle } from "@/ui/toggle";
import { useToast } from "@/ui/use-toast";
import { playPreviewBlob } from "./playBlob";
import { SoundstageRadar } from "./spatial/SoundstageRadar";
import { SourceControls } from "./spatial/SourceControls";
import type { SpatialSource } from "./spatial/types";

const GAIN_MIN_DB = -30;
const GAIN_MAX_DB = 12;

const ENVIRONMENTS = [
	"car_interior",
	"coffee_shop",
	"bedroom",
	"church",
	"studio_booth",
] as const;

function environmentLabel(key: string) {
	return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function radarToSpatial(x: number, y: number) {
	return {
		x: Math.max(-1, Math.min(1, (x - 200) / 180)),
		y: 0,
		z: Math.max(-1, Math.min(1, (y - 150) / 130)),
	};
}

export function SpatialView() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const [sources, setSources] = useState<SpatialSource[]>([]);
	type Environment = (typeof ENVIRONMENTS)[number];

	const [environment, setEnvironment] = useState<Environment>("studio_booth");
	const [convolutionMix, setConvolutionMix] = useState(0.3);
	const [dopplerIntensity, setDopplerIntensity] = useState(0);
	const [binaural, setBinaural] = useState(true);
	const [dragging, setDragging] = useState<string | null>(null);
	const [rendering, setRendering] = useState(false);
	const [renderBlob, setRenderBlob] = useState<Blob | null>(null);
	const [renderError, setRenderError] = useState<string | null>(null);

	const statusQuery = useQuery({
		queryKey: ["spatial-status"],
		queryFn: () => apiClient.getSpatialStatus(),
	});
	const steamAudioAvailable = statusQuery.data?.steam_audio ?? false;

	const addSource = useCallback(() => {
		setSources((prev) => [
			...prev,
			{
				id: `src-${Date.now()}`,
				audioPath: "",
				label: `Source ${prev.length + 1}`,
				x: 200,
				y: 150,
				gainDb: 0,
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

	const updateGainDb = useCallback((id: string, gainDb: number) => {
		setSources((prev) =>
			prev.map((s) =>
				s.id === id
					? {
							...s,
							gainDb: Math.max(GAIN_MIN_DB, Math.min(GAIN_MAX_DB, gainDb)),
						}
					: s,
			),
		);
	}, []);

	const pickAudio = useCallback(
		(
			sourceId: string,
			gen: {
				id: string;
				audio_path?: string;
				profile_name: string;
				text: string;
			},
		) => {
			setSources((prev) =>
				prev.map((s) =>
					s.id === sourceId
						? {
								...s,
								audioPath: gen.audio_path ?? "",
								label: gen.profile_name || gen.text.slice(0, 30),
							}
						: s,
				),
			);
		},
		[],
	);

	const updatePosition = useCallback((id: string, x: number, y: number) => {
		setSources((prev) =>
			prev.map((s) =>
				s.id === id
					? {
							...s,
							x: Math.max(20, Math.min(380, x)),
							y: Math.max(20, Math.min(280, y)),
						}
					: s,
			),
		);
	}, []);

	const activeSources = sources.filter((s) => !s.muted && s.audioPath);

	async function handleRender() {
		if (activeSources.length === 0) {
			toast({
				title: t("spatial.noAudioSelected", {
					defaultValue: "No audio selected",
				}),
				description: t("spatial.noAudioSelectedDesc", {
					defaultValue:
						"Pick a completed generation for at least one unmuted source.",
				}),
			});
			return;
		}
		setRendering(true);
		setRenderBlob(null);
		setRenderError(null);
		try {
			const blob = await apiClient.renderSpatialMix(
				activeSources.map((s) => {
					const pos = radarToSpatial(s.x, s.y);
					return {
						audioPath: s.audioPath,
						x: pos.x,
						y: pos.y,
						z: pos.z,
						distance: 1.0,
						gainDb: s.gainDb,
					};
				}),
				environment,
				convolutionMix,
				dopplerIntensity,
				binaural,
			);
			setRenderBlob(blob);
			playPreviewBlob(blob);
			toast({
				title: t("spatial.renderComplete", {
					defaultValue: "Spatial render complete",
				}),
				description: t("spatial.renderCompleteDesc", {
					defaultValue: "Rendered through the “church” environment.",
				}),
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not render spatial audio";
			setRenderError(message);
			toast({
				title: t("spatial.renderFailed", {
					defaultValue: "Spatial render failed",
				}),
				description: message,
				variant: "destructive",
			});
		} finally {
			setRendering(false);
		}
	}

	async function handleSave() {
		if (!renderBlob) {
			return;
		}
		try {
			await apiClient.saveGeneratedAudio(
				renderBlob,
				`Spatial mix ${new Date().toLocaleTimeString().replace(/:/g, "-")}`,
				"generation",
				"spatial",
			);
			toast({
				title: t("spatial.saved", { defaultValue: "Saved to Library" }),
			});
		} catch (err) {
			toast({
				title: t("spatial.saveFailed", { defaultValue: "Save failed" }),
				description:
					err instanceof Error ? err.message : "Could not save to library",
				variant: "destructive",
			});
		}
	}

	const hasAny = sources.length > 0;

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				helpPath="/spatial"
				title={t("spatial.title", { defaultValue: "3D Spatializer" })}
				description={t("spatial.description", {
					defaultValue:
						"Position sources around the listener and render spatial audio.",
				})}
			/>

			<Separator />

			{hasAny ? (
				<>
					<div className="max-w-xl space-y-1">
						<span className="text-xs font-medium text-foreground">
							{t("spatial.sourceAudio", {
								defaultValue: "Source audio",
							})}
						</span>
						<SourceControls
							sources={sources}
							onAdd={addSource}
							onRemove={removeSource}
							onToggleMute={toggleMute}
							onUpdateGainDb={updateGainDb}
							onPickAudio={pickAudio}
						/>
					</div>

					<Separator />

					<SoundstageRadar
						sources={sources}
						dragging={dragging}
						onDragStart={setDragging}
						onDragMove={(x, y) => {
							if (dragging) {
								updatePosition(dragging, x, y);
							}
						}}
						onDragEnd={() => setDragging(null)}
					/>
				</>
			) : (
				<EmptyState
					title={t("spatial.noSources", { defaultValue: "No sources yet" })}
					body={t("spatial.noSourcesBody", {
						defaultValue:
							"Add a source, pick its audio, drag it on the soundstage, then render.",
					})}
					action={
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={addSource}
						>
							{t("spatial.addSource", { defaultValue: "Add Source" })}
						</Button>
					}
				/>
			)}

			{hasAny && (
				<>
					<Separator />

					<div className="space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-xs font-medium text-foreground">
								{t("spatial.backend", { defaultValue: "Backend" })}
							</span>
							<span
								className={`text-xs font-semibold px-2 py-0.5 rounded ${
									steamAudioAvailable
										? "bg-accent/10 text-accent border border-accent/20"
										: "bg-muted/50 text-muted-foreground border border-muted"
								}`}
							>
								{steamAudioAvailable ? "Steam Audio" : "NumPy fallback"}
							</span>
							{!steamAudioAvailable && (
								<Button
									size="sm"
									variant="outline"
									onClick={() => void statusQuery.refetch()}
									title={t("spatial.checkSdk", {
										defaultValue: "Re-check for Steam Audio SDK",
									})}
								>
									{t("spatial.checkSdk", {
										defaultValue: "Check SDK",
									})}
								</Button>
							)}
							{!steamAudioAvailable && (
								<span className="text-xs text-muted-foreground">
									{t("spatial.sdkHint", {
										defaultValue: "Install Steam Audio for real HRTF binaural.",
									})}
								</span>
							)}
						</div>

						<div className="mt-3 space-y-1">
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor="spatial-env">
									{t("spatial.environment", {
										defaultValue: "Environment",
									})}
								</Label>
								<Select
									value={environment}
									onValueChange={(v) => setEnvironment(v as Environment)}
								>
									<SelectTrigger
										id="spatial-env"
										className="h-8 max-w-xs text-xs"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ENVIRONMENTS.map((env) => (
											<SelectItem key={env} value={env}>
												{environmentLabel(env)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="max-w-xs space-y-1">
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor="spatial-wet">
									{t("spatial.convolutionMix", {
										defaultValue: "Convolution mix",
									})}
								</Label>
								<span className="font-mono text-xs tabular-nums text-muted-foreground">
									{(convolutionMix * 100).toFixed(0)}%
								</span>
							</div>
							<Slider
								id="spatial-wet"
								min={0}
								max={1}
								step={0.01}
								value={[convolutionMix]}
								onValueChange={([v]) => setConvolutionMix(v ?? 0.3)}
								aria-label={t("spatial.convolutionMix", {
									defaultValue: "Convolution mix",
								})}
							/>
						</div>

						<div className="max-w-xs space-y-1">
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor="spatial-doppler">
									{t("spatial.doppler", {
										defaultValue: "Doppler effect",
									})}
								</Label>
								<span className="font-mono text-xs tabular-nums text-muted-foreground">
									{dopplerIntensity.toFixed(2)}
								</span>
							</div>
							<Slider
								id="spatial-doppler"
								min={0}
								max={1}
								step={0.01}
								value={[dopplerIntensity]}
								onValueChange={([v]) => setDopplerIntensity(v ?? 0)}
								aria-label={t("spatial.doppler", {
									defaultValue: "Doppler effect",
								})}
							/>
						</div>

						<div className="flex items-center justify-between gap-2">
							<Label htmlFor="spatial-binaural">
								{t("spatial.binaural", {
									defaultValue: "HRTF binaural",
								})}
							</Label>
							<Toggle
								id="spatial-binaural"
								pressed={binaural}
								onPressedChange={setBinaural}
								className="h-6 px-2 text-xs"
								aria-label={
									binaural
										? t("spatial.binauralOn", {
												defaultValue: "HRTF binaural on",
											})
										: t("spatial.binauralOff", {
												defaultValue: "HRTF binaural off",
											})
								}
							>
								{binaural ? "On" : "Off"}
							</Toggle>
						</div>
					</div>
				</>
			)}

			{renderError && (
				<div
					className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-[12px] text-destructive"
					role="alert"
				>
					{renderError}
				</div>
			)}

			<Separator />

			<div>
				<Button
					type="button"
					size="sm"
					className="w-full"
					disabled={rendering || !hasAny || activeSources.length === 0}
					title={t("spatial.renderTitle", {
						defaultValue: "Render spatial mix",
					})}
					aria-label={t("spatial.renderAria", {
						defaultValue: "Apply spatial effects",
					})}
					onClick={() => void handleRender()}
				>
					{rendering ? (
						<>
							<Spinner size="xs" className="mr-2" />
							{t("spatial.rendering", { defaultValue: "Rendering…" })}
						</>
					) : (
						t("spatial.render", { defaultValue: "Apply Spatial Effects" })
					)}
				</Button>
				{renderBlob && (
					<Button
						type="button"
						size="sm"
						className="w-full mt-2"
						title={t("spatial.saveToLibraryTitle", {
							defaultValue: "Save the rendered spatial mix to the Library",
						})}
						aria-label={t("spatial.saveToLibrary", {
							defaultValue: "Save to Library",
						})}
						onClick={() => void handleSave()}
					>
						{t("spatial.saveToLibrary", { defaultValue: "Save to Library" })}
					</Button>
				)}
			</div>
		</div>
	);
}
