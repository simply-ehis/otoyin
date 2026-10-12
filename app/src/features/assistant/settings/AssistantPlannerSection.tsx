import { memo, useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_SETTINGS_FAILED,
	ERR_TITLE_SETTINGS,
} from "@/lib/errorMessages";
import { logger } from "@/lib/utils/debug";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Spinner } from "@/ui/Spinner";
import { Switch } from "@/ui/switch";
import { useToast } from "@/ui/use-toast";

export const AssistantPlannerSection = memo(function AssistantPlannerSection() {
	const { toast } = useToast();
	const [kvQuant, setKvQuant] = useState<string>("q8_0");
	const [kvQuantOptions, setKvQuantOptions] = useState<string[]>([]);
	const [kvQuantSaving, setKvQuantSaving] = useState(false);
	const [gpuLayers, setGpuLayers] = useState<number | "">("");
	const [gpuSaving, setGpuSaving] = useState(false);
	const [gpuEnvOverride, setGpuEnvOverride] = useState(false);
	const [moeCacheGb, setMoeCacheGb] = useState<number | "">("");
	const [moeDirect, setMoeDirect] = useState(false);
	const [moeSaving, setMoeSaving] = useState(false);
	const [plannerLoaded, setPlannerLoaded] = useState(false);
	const [loadedNCtx, setLoadedNCtx] = useState<number | null>(null);
	const [effectiveNCtx, setEffectiveNCtx] = useState<number | null>(null);
	const [loadedKvQuant, setLoadedKvQuant] = useState<string | null>(null);
	const [loadedGpuLayers, setLoadedGpuLayers] = useState<number | null>(null);
	const [effectiveGpuLayers, setEffectiveGpuLayers] = useState<number | null>(
		null,
	);
	const [reloading, setReloading] = useState(false);

	const applyPlannerState = useCallback(
		(settings: {
			planner_loaded?: boolean;
			loaded_n_ctx?: number | null;
			effective_n_ctx?: number | null;
			loaded_kv_quant?: string | null;
			loaded_gpu_layers?: number | null;
			effective_gpu_layers?: number | null;
			gpu_layers_env_override?: boolean;
		}) => {
			setPlannerLoaded(Boolean(settings.planner_loaded));
			setLoadedNCtx(settings.loaded_n_ctx ?? null);
			setEffectiveNCtx(settings.effective_n_ctx ?? null);
			setLoadedKvQuant(settings.loaded_kv_quant ?? null);
			setLoadedGpuLayers(settings.loaded_gpu_layers ?? null);
			setEffectiveGpuLayers(settings.effective_gpu_layers ?? null);
			setGpuEnvOverride(Boolean(settings.gpu_layers_env_override));
		},
		[],
	);

	const reloadStale =
		plannerLoaded &&
		((loadedNCtx != null &&
			effectiveNCtx != null &&
			loadedNCtx !== effectiveNCtx) ||
			(loadedKvQuant != null && kvQuant !== "" && loadedKvQuant !== kvQuant) ||
			(loadedGpuLayers != null &&
				effectiveGpuLayers != null &&
				loadedGpuLayers !== effectiveGpuLayers));

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [settings, caps] = await Promise.all([
					apiClient.getAssistantSettings(),
					apiClient.getModelCapabilities(),
				]);
				if (cancelled) {
					return;
				}
				setKvQuant(settings.kv_quant || "q8_0");
				setGpuLayers(settings.gpu_layers ?? "");
				setMoeCacheGb(settings.moe_stream_cache_gb ?? "");
				setMoeDirect(Boolean(settings.moe_stream_direct));
				applyPlannerState(settings);
				setKvQuantOptions(caps.kv_quant?.options ?? []);
			} catch (e: unknown) {
				logger.debug("[assistant] planner settings load failed", e);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [applyPlannerState]);

	const handleKvQuantChange = async (value: string) => {
		setKvQuant(value);
		setKvQuantSaving(true);
		try {
			await apiClient.updateAssistantSettings({ kv_quant: value });
			toast({ title: "KV-cache quant saved — applies on next model load" });
		} catch {
			toast({
				title: ERR_TITLE_SETTINGS,
				description: ERR_DESC_SETTINGS_FAILED,
				variant: "destructive",
			});
		} finally {
			setKvQuantSaving(false);
		}
	};

	const handleGpuLayersSave = async () => {
		const value =
			gpuLayers === ""
				? null
				: Math.max(0, Math.min(999, Math.round(gpuLayers)));
		setGpuSaving(true);
		try {
			await apiClient.updateAssistantSettings({ gpu_layers: value });
			setGpuLayers(value ?? "");
			applyPlannerState(await apiClient.getAssistantSettings());
			toast({
				title: plannerLoaded
					? "Saved — applies when the planner reloads"
					: "GPU layers saved",
			});
		} catch {
			toast({
				title: ERR_TITLE_SETTINGS,
				description: ERR_DESC_SETTINGS_FAILED,
				variant: "destructive",
			});
		} finally {
			setGpuSaving(false);
		}
	};

	const handleMoeSave = async () => {
		const cacheValue =
			moeCacheGb === ""
				? null
				: Math.max(0, Math.min(64, Math.round(moeCacheGb)));
		setMoeSaving(true);
		try {
			await apiClient.updateAssistantSettings({
				moe_stream_cache_gb: cacheValue,
				moe_stream_direct: moeDirect,
			});
			setMoeCacheGb(cacheValue ?? "");
			applyPlannerState(await apiClient.getAssistantSettings());
			toast({
				title: plannerLoaded
					? "Saved — applies when the planner reloads"
					: "MoE streaming settings saved",
			});
		} catch {
			toast({
				title: ERR_TITLE_SETTINGS,
				description: ERR_DESC_SETTINGS_FAILED,
				variant: "destructive",
			});
		} finally {
			setMoeSaving(false);
		}
	};

	const handleReloadPlanner = async () => {
		setReloading(true);
		try {
			const res = await apiClient.reloadPlanner();
			applyPlannerState(await apiClient.getAssistantSettings());
			toast({ title: res.message });
		} catch {
			toast({
				title: ERR_TITLE_SETTINGS,
				description: ERR_DESC_SETTINGS_FAILED,
				variant: "destructive",
			});
		} finally {
			setReloading(false);
		}
	};

	return (
		<>
			<div className="space-y-2 pt-2 border-t border-border">
				<div className="space-y-1">
					<Label
						htmlFor="kv-quant"
						className="text-xs font-medium text-muted-foreground"
					>
						KV-cache quantization
					</Label>
					<p className="text-xs text-muted-foreground/70">
						Precision of the planner's KV cache. Lower (q4_0) saves RAM at a
						small quality cost; f16 is highest fidelity. Applies on next model
						load.
					</p>
					<select
						id="kv-quant"
						className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
						value={kvQuant}
						onChange={(e) => handleKvQuantChange(e.target.value)}
						disabled={kvQuantSaving}
					>
						{(kvQuantOptions.length
							? kvQuantOptions
							: ["f16", "q8_0", "q5_0", "q4_0", "q4_1"]
						).map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="space-y-2 pt-2 border-t border-border">
				<div className="space-y-1">
					<Label
						htmlFor="gpu-layers"
						className="text-xs font-medium text-muted-foreground"
					>
						GPU layers offload
					</Label>
					<p className="text-xs text-muted-foreground/70">
						How many model layers run on the GPU (llama-server -ngl). 0 uses the
						CPU only. Higher is faster but uses more VRAM. Applies on next
						planner load.
						{gpuEnvOverride
							? " The TWENTYLABS_LLAMA_GPU_LAYERS environment variable is set and overrides this."
							: ""}
					</p>
					<div className="flex gap-2">
						<Input
							id="gpu-layers"
							type="number"
							min={0}
							max={999}
							step={1}
							value={gpuLayers}
							onChange={(e) =>
								setGpuLayers(
									e.target.value === "" ? "" : Number(e.target.value),
								)
							}
							placeholder="0 (CPU)"
							disabled={gpuSaving || gpuEnvOverride}
							className="h-8 text-xs"
						/>
						<Button
							variant="outline"
							size="sm"
							className="h-8 shrink-0 px-2 text-xs"
							onClick={handleGpuLayersSave}
							disabled={gpuSaving || gpuEnvOverride}
						>
							{gpuSaving ? <Spinner size="xs" /> : "Save"}
						</Button>
					</div>
				</div>
			</div>

			<div className="space-y-2 pt-2 border-t border-border">
				<div className="space-y-1">
					<Label
						htmlFor="moe-cache-gb"
						className="text-xs font-medium text-muted-foreground"
					>
						MoE expert streaming cache
					</Label>
					<p className="text-xs text-muted-foreground/70">
						For Mixture-of-Experts models only. Sets the SSD read cache size in
						GB (llama-server --moe-stream-cache). When a MoE model is loaded and
						this is 0, the backend auto-computes a value from available RAM. 0 =
						auto (disabled for dense models). Applies on next planner load.
					</p>
					<div className="flex gap-2">
						<Input
							id="moe-cache-gb"
							type="number"
							min={0}
							max={64}
							step={1}
							value={moeCacheGb}
							onChange={(e) =>
								setMoeCacheGb(
									e.target.value === "" ? "" : Number(e.target.value),
								)
							}
							placeholder="0 (auto)"
							disabled={moeSaving}
							className="h-8 text-xs"
						/>
						<Button
							variant="outline"
							size="sm"
							className="h-8 shrink-0 px-2 text-xs"
							onClick={handleMoeSave}
							disabled={moeSaving}
						>
							{moeSaving ? <Spinner size="xs" /> : "Save"}
						</Button>
					</div>
				</div>
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label
							htmlFor="moe-direct"
							className="text-xs font-medium text-muted-foreground"
						>
							O_DIRECT for MoE reads
						</Label>
						<p className="text-xs text-muted-foreground/70">
							Bypass the OS page cache for expert weight reads. Prevents large
							MoE models from evicting other data. Only for SSDs. Applies on
							next planner load.
						</p>
					</div>
					<Switch
						id="moe-direct"
						checked={moeDirect}
						onCheckedChange={(v) => {
							setMoeDirect(v);
						}}
						disabled={moeSaving}
					/>
				</div>
			</div>

			{reloadStale && (
				<div className="space-y-2 pt-2 border-t border-border">
					<div className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning-soft px-2 py-1.5">
						<p className="text-xs text-warning-text">
							Planner is running with older settings
							{loadedNCtx != null &&
							effectiveNCtx != null &&
							loadedNCtx !== effectiveNCtx
								? ` (n_ctx ${loadedNCtx?.toLocaleString()} → ${effectiveNCtx?.toLocaleString()})`
								: ""}
							— reload to apply.
						</p>
						<Button
							variant="outline"
							size="sm"
							className="h-7 shrink-0 px-2 text-xs"
							onClick={handleReloadPlanner}
							disabled={reloading}
						>
							{reloading ? <Spinner size="xs" /> : "Reload planner"}
						</Button>
					</div>
				</div>
			)}
		</>
	);
});
