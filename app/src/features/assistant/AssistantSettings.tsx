import { memo, useCallback, useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Spinner } from "@/ui/Spinner";
import { Switch } from "@/ui/switch";
import { useToast } from "@/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_SETTINGS_FAILED,
	ERR_DESC_VALIDATION,
	ERR_TITLE_SETTINGS,
	ERR_TITLE_VALIDATION,
} from "@/lib/errorMessages";
import { logger } from "@/lib/utils/debug";

const TOKEN_MIN = 2048;
const TOKEN_MAX = 32768;

interface LocalModel {
	id: string;
	name: string;
	size: string;
}

interface ApiProvider {
	id: string;
	name: string;
	base_url: string;
}

interface SettingsProps {
	localModels: LocalModel[];
	apiProviders: ApiProvider[];
	selectedModel: string;
	setSelectedModel: (v: string) => void;
	selectedProvider: string;
	setSelectedProvider: (v: string) => void;
	apiKey: string;
	setApiKey: (v: string) => void;
	apiBaseUrl: string;
	setApiBaseUrl: (v: string) => void;
}

export const AssistantSettings = memo(function AssistantSettings({
	localModels,
	apiProviders,
	selectedModel,
	setSelectedModel,
	selectedProvider,
	setSelectedProvider,
	apiKey,
	setApiKey,
	apiBaseUrl,
	setApiBaseUrl,
}: SettingsProps) {
	const { toast } = useToast();
	const [keyValid, setKeyValid] = useState<boolean | null>(null);
	const useApiKey = Boolean(selectedProvider);
	const [validating, setValidating] = useState(false);

	// Context / token budget (Slice C2). Loaded from settings + the RAM-aware
	// default published by /models/capabilities so the user can override and see
	// the warning when they push past the safe default.
	const [ctxOverride, setCtxOverride] = useState<number | "">("");
	const [maxOverride, setMaxOverride] = useState<number | "">("");
	const [ramDefault, setRamDefault] = useState<number | null>(null);
	const [ctxSaving, setCtxSaving] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState<boolean>(false);
	const [thinkingSaving, setThinkingSaving] = useState(false);
	const [maxCtx, setMaxCtx] = useState<number>(TOKEN_MAX);

	// Editable system prompt + KV-cache quant (Slice C4).
	const [systemPrompt, setSystemPrompt] = useState<string>("");
	const [systemPromptSaving, setSystemPromptSaving] = useState(false);
	const [defaultPrompt, setDefaultPrompt] = useState<string>("");
	const [showDefault, setShowDefault] = useState(false);
	const [kvQuant, setKvQuant] = useState<string>("q8_0");
	const [kvQuantOptions, setKvQuantOptions] = useState<string[]>([]);
	const [kvQuantSaving, setKvQuantSaving] = useState(false);

	// GPU offload layers (Slice P2): null/0 = CPU-only. Same deferred-apply
	// contract as n_ctx/kv_quant — takes effect at planner load.
	const [gpuLayers, setGpuLayers] = useState<number | "">("");
	const [gpuSaving, setGpuSaving] = useState(false);
	const [gpuEnvOverride, setGpuEnvOverride] = useState(false);

	// MoE (Mixture of Experts) streaming — SSD-based expert weight offload.
	const [moeCacheGb, setMoeCacheGb] = useState<number | "">("");
	const [moeDirect, setMoeDirect] = useState(false);
	const [moeSaving, setMoeSaving] = useState(false);

	// Live planner state: n_ctx/kv_quant apply at load time only. When the
	// running server's n_ctx differs from the effective setting, show a
	// reload notice instead of pretending "saved" means "active".
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
				setCtxOverride(settings.context_tokens ?? "");
				setMaxOverride(settings.max_tokens ?? "");
				setThinkingEnabled(Boolean(settings.thinking_enabled));
				setSystemPrompt(settings.system_prompt ?? "");
				setKvQuant(settings.kv_quant || "q8_0");
				setGpuLayers(settings.gpu_layers ?? "");
				setMoeCacheGb(settings.moe_stream_cache_gb ?? "");
				setMoeDirect(Boolean(settings.moe_stream_direct));
				applyPlannerState(settings);
				const bySize = caps.llm_context?.by_size ?? {};
				const maxBySize = bySize;
				const ramDefault =
					bySize[settings.model_size] ??
					bySize[settings.model_size.split("-")[0]] ??
					null;
				setRamDefault(ramDefault);
				const resolvedMax =
					maxBySize[settings.model_size] ??
					maxBySize[settings.model_size.split("-")[0]] ??
					TOKEN_MAX;
				setMaxCtx(resolvedMax);
				setKvQuantOptions(caps.kv_quant?.options ?? []);
			} catch {
				if (!cancelled) {
					setLoadError(true);
				}
			}
		})();
		// Fetch the built-in default prompt for review/reset (independent of settings).
		apiClient
			.getAssistantSystemPromptDefault()
			.then((d) => {
				if (!cancelled) {
					setDefaultPrompt(d);
				}
			})
			.catch((e: unknown) => {
				logger.debug("[assistant] getSystemPrompt failed", e);
			});
		return () => {
			cancelled = true;
		};
	}, [applyPlannerState]);

	const clampToken = (v: number | ""): number | null => {
		if (v === "") {
			return null;
		}
		return Math.max(TOKEN_MIN, Math.min(maxCtx, Math.round(v)));
	};

	const handleSaveTokens = async () => {
		setCtxSaving(true);
		try {
			const patch = {
				context_tokens: clampToken(ctxOverride),
				max_tokens: clampToken(maxOverride),
			};
			await apiClient.updateAssistantSettings(patch);
			applyPlannerState(await apiClient.getAssistantSettings());
			toast({
				title: plannerLoaded
					? "Saved — applies when the planner reloads"
					: "Context & token budget saved",
			});
		} catch {
			toast({
				title: ERR_TITLE_SETTINGS,
				description: ERR_DESC_SETTINGS_FAILED,
				variant: "destructive",
			});
		} finally {
			setCtxSaving(false);
		}
	};

	const handleResetTokens = async () => {
		setCtxSaving(true);
		try {
			await apiClient.updateAssistantSettings({
				context_tokens: null,
				max_tokens: null,
			});
			setCtxOverride("");
			setMaxOverride("");
			toast({ title: "Reset to RAM-aware default" });
		} catch {
			toast({
				title: ERR_TITLE_SETTINGS,
				description: ERR_DESC_SETTINGS_FAILED,
				variant: "destructive",
			});
		} finally {
			setCtxSaving(false);
		}
	};

	const handleThinkingToggle = async (checked: boolean) => {
		setThinkingEnabled(checked);
		setThinkingSaving(true);
		try {
			await apiClient.updateAssistantSettings({ thinking_enabled: checked });
		} catch {
			setThinkingEnabled(!checked);
			toast({
				title: ERR_TITLE_SETTINGS,
				description: ERR_DESC_SETTINGS_FAILED,
				variant: "destructive",
			});
		} finally {
			setThinkingSaving(false);
		}
	};

	const handleSaveSystemPrompt = async () => {
		setSystemPromptSaving(true);
		try {
			await apiClient.updateAssistantSettings({ system_prompt: systemPrompt });
			toast({ title: "System prompt saved" });
		} catch {
			toast({
				title: ERR_TITLE_SETTINGS,
				description: ERR_DESC_SETTINGS_FAILED,
				variant: "destructive",
			});
		} finally {
			setSystemPromptSaving(false);
		}
	};

	const handleResetSystemPrompt = async () => {
		setSystemPromptSaving(true);
		try {
			// Empty string clears the override -> built-in default applies.
			await apiClient.updateAssistantSettings({ system_prompt: "" });
			setSystemPrompt("");
			toast({ title: "Reset to built-in system prompt" });
		} catch {
			toast({
				title: ERR_TITLE_SETTINGS,
				description: ERR_DESC_SETTINGS_FAILED,
				variant: "destructive",
			});
		} finally {
			setSystemPromptSaving(false);
		}
	};

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

	const overridePastDefault =
		ramDefault != null &&
		typeof ctxOverride === "number" &&
		ctxOverride > ramDefault;

	const handleProviderChange = (providerId: string) => {
		setSelectedProvider(providerId);
		setApiKey("");
		setApiBaseUrl("");
		setKeyValid(null);
		if (providerId) {
			const provider = apiProviders.find((p) => p.id === providerId);
			if (provider?.base_url) {
				setApiBaseUrl(provider.base_url);
			}
		}
	};

	const handleValidate = async () => {
		if (!apiKey || !apiBaseUrl) {
			return;
		}
		setValidating(true);
		try {
			const result = await apiClient.validateApiKey(apiKey, apiBaseUrl);
			setKeyValid(result.valid);
			if (result.valid) {
				toast({
					title: "API key validated",
					description: `${result.model_count ?? 0} models available`,
				});
			} else {
				toast({
					title: ERR_TITLE_VALIDATION,
					description: "That API key doesn't look right — double-check it",
					variant: "destructive",
				});
			}
		} catch {
			setKeyValid(false);
			toast({
				title: ERR_TITLE_VALIDATION,
				description: ERR_DESC_VALIDATION,
				variant: "destructive",
			});
		} finally {
			setValidating(false);
		}
	};

	return (
		<div className="px-4 py-3 bg-secondary space-y-3">
			<div className="space-y-1.5">
				<label
					htmlFor="model-source"
					className="text-xs font-medium text-muted-foreground"
				>
					Model Source
				</label>
				<select
					id="model-source"
					className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
					value={selectedProvider}
					onChange={(e) => handleProviderChange(e.target.value)}
				>
					<option value="">Local Qwen3 models</option>
					{apiProviders.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
			</div>
			{!useApiKey && (
				<div className="space-y-1.5">
					<label
						htmlFor="local-model"
						className="text-xs font-medium text-muted-foreground"
					>
						Local Model
					</label>
					{loadError ? (
						<p className="text-xs text-destructive">
							Could not connect to backend. Start the server and refresh.
						</p>
					) : (
						<select
							id="local-model"
							className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
							value={selectedModel}
							onChange={(e) => setSelectedModel(e.target.value)}
						>
							{localModels.map((m) => (
								<option key={m.id} value={m.id}>
									{m.name} ({m.size})
								</option>
							))}
						</select>
					)}
				</div>
			)}
			{useApiKey && (
				<>
					<div className="space-y-1.5">
						<label
							htmlFor="api-base-url"
							className="text-xs font-medium text-muted-foreground"
						>
							API Base URL
						</label>
						<Input
							id="api-base-url"
							value={apiBaseUrl}
							onChange={(e) => {
								setApiBaseUrl(e.target.value);
								setKeyValid(null);
							}}
							placeholder="https://api.openai.com/v1"
							className="h-8 text-xs"
						/>
					</div>
					<div className="space-y-1.5">
						<label
							htmlFor="api-key"
							className="text-xs font-medium text-muted-foreground"
						>
							API Key
						</label>
						<div className="flex gap-2">
							<Input
								id="api-key"
								type="password"
								value={apiKey}
								onChange={(e) => {
									setApiKey(e.target.value);
									setKeyValid(null);
								}}
								placeholder="sk-..."
								className="h-8 text-xs flex-1"
							/>
							<Button
								variant="outline"
								size="sm"
								className="h-8 px-2 text-xs shrink-0"
								onClick={handleValidate}
								disabled={validating || !apiKey || !apiBaseUrl}
							>
								{validating ? <Spinner size="xs" /> : "Verify"}
							</Button>
						</div>
						{keyValid === true && (
							<span className="text-xs text-success-text">Valid</span>
						)}
						{keyValid === false && (
							<span className="text-xs text-destructive">Invalid key</span>
						)}
					</div>
					<div className="space-y-1.5">
						<label
							htmlFor="model-id"
							className="text-xs font-medium text-muted-foreground"
						>
							Model ID
						</label>
						<Input
							id="model-id"
							value={selectedModel}
							onChange={(e) => setSelectedModel(e.target.value)}
							placeholder="gpt-4o"
							className="h-8 text-xs"
						/>
					</div>
				</>
			)}

			<div className="space-y-2 pt-2 border-t border-border">
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label
							htmlFor="thinking-toggle"
							className="text-xs font-medium text-muted-foreground"
						>
							Thinking / reasoning mode
						</Label>
						<p className="text-xs text-muted-foreground/70">
							Show the model's chain-of-thought as a separate reasoning step.
						</p>
					</div>
					<Switch
						id="thinking-toggle"
						checked={thinkingEnabled}
						onCheckedChange={handleThinkingToggle}
						disabled={thinkingSaving}
						aria-label="Toggle thinking / reasoning mode"
					/>
				</div>
			</div>

			<div className="space-y-2 pt-2 border-t border-border">
				<div className="space-y-1">
					<Label
						htmlFor="system-prompt"
						className="text-xs font-medium text-muted-foreground"
					>
						System prompt
					</Label>
					<p className="text-xs text-muted-foreground/70">
						Review and edit the instructions the assistant follows. Leave blank
						to use the built-in default.
					</p>
					<textarea
						id="system-prompt"
						value={systemPrompt}
						onChange={(e) => setSystemPrompt(e.target.value)}
						rows={6}
						placeholder={
							defaultPrompt ||
							"You are otoyin' AI assistant for audio production."
						}
						className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs leading-relaxed outline-none focus:border-accent resize-none max-h-[300px] overflow-y-auto"
					/>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className="h-8 px-2 text-xs"
							onClick={handleSaveSystemPrompt}
							disabled={systemPromptSaving}
						>
							{systemPromptSaving ? <Spinner size="xs" /> : "Save prompt"}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-8 px-2 text-xs"
							onClick={handleResetSystemPrompt}
							disabled={systemPromptSaving}
						>
							{systemPromptSaving ? <Spinner size="xs" /> : "Reset to default"}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-8 px-2 text-xs"
							onClick={() => setShowDefault((v) => !v)}
						>
							{showDefault ? "Hide built-in" : "Show built-in"}
						</Button>
					</div>
					{showDefault && defaultPrompt && (
						<pre className="max-h-40 overflow-auto rounded-md border border-border bg-sunken p-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
							{defaultPrompt}
						</pre>
					)}
				</div>
			</div>

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

			<div className="space-y-2 pt-2 border-t border-border">
				<p className="text-xs font-medium text-muted-foreground">
					Context &amp; Token Budget
				</p>
				<p className="text-xs text-muted-foreground/70">
					{ramDefault != null
						? `RAM-aware default: ${ramDefault.toLocaleString()} tokens. Leave blank to use it.`
						: "Loading RAM-aware default…"}
				</p>
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label
							htmlFor="ctx-tokens"
							className="text-xs text-muted-foreground"
						>
							Context (n_ctx)
						</label>
						<Input
							id="ctx-tokens"
							type="number"
							min={TOKEN_MIN}
							max={maxCtx}
							step={1024}
							value={ctxOverride}
							onChange={(e) =>
								setCtxOverride(
									e.target.value === "" ? "" : Number(e.target.value),
								)
							}
							placeholder={ramDefault?.toString() ?? "auto"}
							className="h-8 text-xs"
						/>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="max-tokens"
							className="text-xs text-muted-foreground"
						>
							Max output tokens
						</label>
						<Input
							id="max-tokens"
							type="number"
							min={TOKEN_MIN}
							max={maxCtx}
							step={1024}
							value={maxOverride}
							onChange={(e) =>
								setMaxOverride(
									e.target.value === "" ? "" : Number(e.target.value),
								)
							}
							placeholder={ramDefault?.toString() ?? "auto"}
							className="h-8 text-xs"
						/>
					</div>
				</div>
				{overridePastDefault && (
					<p className="text-xs text-warning-text">
						Warning: you are forcing the context above the RAM-safe default (
						{ramDefault?.toLocaleString()} tokens). This uses more memory and
						may stall or crash on low-RAM machines — your call.
					</p>
				)}
				{reloadStale && (
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
				)}
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						className="h-8 px-2 text-xs"
						onClick={handleSaveTokens}
						disabled={ctxSaving}
					>
						{ctxSaving ? <Spinner size="xs" /> : "Save"}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 px-2 text-xs"
						onClick={handleResetTokens}
						disabled={ctxSaving}
					>
						{ctxSaving ? <Spinner size="xs" /> : "Reset to default"}
					</Button>
				</div>
			</div>
		</div>
	);
});
