import { memo } from "react";
import type { ApiProvider, LocalModel } from "./AssistantPanel.types";
import { AssistantModelSection } from "./settings/AssistantModelSection";
import { AssistantPlannerSection } from "./settings/AssistantPlannerSection";
import { AssistantPromptSection } from "./settings/AssistantPromptSection";
import { AssistantTokensSection } from "./settings/AssistantTokensSection";

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
	return (
		<div className="px-4 py-3 bg-secondary space-y-3">
			<AssistantModelSection
				localModels={localModels}
				apiProviders={apiProviders}
				selectedModel={selectedModel}
				setSelectedModel={setSelectedModel}
				selectedProvider={selectedProvider}
				setSelectedProvider={setSelectedProvider}
				apiKey={apiKey}
				setApiKey={setApiKey}
				apiBaseUrl={apiBaseUrl}
				setApiBaseUrl={setApiBaseUrl}
			/>
			<AssistantPromptSection />
			<AssistantPlannerSection />
			<AssistantTokensSection />
		</div>
	);
});
