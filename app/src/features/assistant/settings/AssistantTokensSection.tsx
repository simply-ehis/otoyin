import { memo, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_SETTINGS_FAILED,
	ERR_TITLE_SETTINGS,
} from "@/lib/errorMessages";
import { logger } from "@/lib/utils/debug";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Spinner } from "@/ui/Spinner";
import { useToast } from "@/ui/use-toast";

const TOKEN_MIN = 2048;
const TOKEN_MAX = 32768;

export const AssistantTokensSection = memo(function AssistantTokensSection() {
	const { toast } = useToast();
	const [ctxOverride, setCtxOverride] = useState<number | "">("");
	const [maxOverride, setMaxOverride] = useState<number | "">("");
	const [ramDefault, setRamDefault] = useState<number | null>(null);
	const [ctxSaving, setCtxSaving] = useState(false);
	const [maxCtx, setMaxCtx] = useState<number>(TOKEN_MAX);
	const [plannerLoaded, setPlannerLoaded] = useState(false);

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
				setPlannerLoaded(Boolean(settings.planner_loaded));
				const bySize = caps.llm_context?.by_size ?? {};
				setRamDefault(
					bySize[settings.model_size] ??
						bySize[settings.model_size.split("-")[0]] ??
						null,
				);
				setMaxCtx(
					bySize[settings.model_size] ??
						bySize[settings.model_size.split("-")[0]] ??
						TOKEN_MAX,
				);
			} catch (e: unknown) {
				logger.debug("[assistant] token settings load failed", e);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

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

	const overridePastDefault =
		ramDefault != null &&
		typeof ctxOverride === "number" &&
		ctxOverride > ramDefault;

	return (
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
					<label htmlFor="ctx-tokens" className="text-xs text-muted-foreground">
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
					<label htmlFor="max-tokens" className="text-xs text-muted-foreground">
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
					{ramDefault?.toLocaleString()} tokens). This uses more memory and may
					stall or crash on low-RAM machines — your call.
				</p>
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
	);
});
