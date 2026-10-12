import { memo, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_SETTINGS_FAILED,
	ERR_TITLE_SETTINGS,
} from "@/lib/errorMessages";
import { logger } from "@/lib/utils/debug";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { Spinner } from "@/ui/Spinner";
import { useToast } from "@/ui/use-toast";

export const AssistantPromptSection = memo(function AssistantPromptSection() {
	const { toast } = useToast();
	const [systemPrompt, setSystemPrompt] = useState<string>("");
	const [systemPromptSaving, setSystemPromptSaving] = useState(false);
	const [defaultPrompt, setDefaultPrompt] = useState<string>("");
	const [showDefault, setShowDefault] = useState(false);

	useEffect(() => {
		let cancelled = false;
		apiClient
			.getAssistantSettings()
			.then((settings) => {
				if (!cancelled) {
					setSystemPrompt(settings.system_prompt ?? "");
				}
			})
			.catch((e: unknown) => {
				logger.debug("[assistant] getSystemPrompt failed", e);
			});
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
	}, []);

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

	return (
		<div className="space-y-2 pt-2 border-t border-border">
			<div className="space-y-1">
				<Label
					htmlFor="system-prompt"
					className="text-xs font-medium text-muted-foreground"
				>
					System prompt
				</Label>
				<p className="text-xs text-muted-foreground/70">
					Review and edit the instructions the assistant follows. Leave blank to
					use the built-in default.
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
	);
});
