import { memo, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_SETTINGS_FAILED,
	ERR_DESC_VALIDATION,
	ERR_TITLE_SETTINGS,
	ERR_TITLE_VALIDATION,
} from "@/lib/errorMessages";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Spinner } from "@/ui/Spinner";
import { Switch } from "@/ui/switch";
import { useToast } from "@/ui/use-toast";
import type { ApiProvider, LocalModel } from "../AssistantPanel.types";

interface AssistantModelSectionProps {
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

export const AssistantModelSection = memo(function AssistantModelSection({
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
}: AssistantModelSectionProps) {
	const { toast } = useToast();
	const [keyValid, setKeyValid] = useState<boolean | null>(null);
	const useApiKey = Boolean(selectedProvider);
	const [validating, setValidating] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState<boolean>(false);
	const [thinkingSaving, setThinkingSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		apiClient
			.getAssistantSettings()
			.then((settings) => {
				if (!cancelled) {
					setThinkingEnabled(Boolean(settings.thinking_enabled));
				}
			})
			.catch(() => {
				if (!cancelled) {
					setLoadError(true);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

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

	return (
		<>
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
		</>
	);
});
