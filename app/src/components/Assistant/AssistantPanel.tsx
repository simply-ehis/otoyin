import {
	CpuChipIcon as Bot,
	KeyIcon as Key,
	XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoiceChatOverlay } from "@/components/VoiceChat/VoiceChatOverlay";
import { apiClient } from "@/lib/api/client";
import { AssistantAssetsPanel } from "./AssistantAssetsPanel";
import { AssistantChatView } from "./AssistantChatView";
import { AssistantHistoryPanel } from "./AssistantHistoryPanel";
import type { TabId } from "./AssistantPanel.types";
import { TABS } from "./AssistantPanel.types";
import { AssistantProjectPanel } from "./AssistantProjectPanel";
import { AssistantSettings } from "./AssistantSettings";
import { ContextWindowIndicator } from "./ContextWindowIndicator";
import { SkillBuilder } from "./SkillBuilder";
import { useAssistantAssets } from "./useAssistantAssets";
import { useAssistantChat } from "./useAssistantChat";
import { useAssistantProjects } from "./useAssistantProjects";

export function AssistantPanel({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [localModels, setLocalModels] = useState<
		Array<{ id: string; name: string; size: string }>
	>([]);
	const [apiProviders, setApiProviders] = useState<
		Array<{ id: string; name: string; base_url: string }>
	>([]);
	const [selectedModel, setSelectedModel] = useState("");
	const [selectedProvider, setSelectedProvider] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [apiBaseUrl, setApiBaseUrl] = useState("");
	const [showSettings, setShowSettings] = useState(false);
	const [view, setView] = useState<TabId>("chat");

	useEffect(() => {
		if (open && localModels.length === 0) {
			apiClient
				.getAssistantModels()
				.then((d) => {
					setLocalModels(d.local);
					setApiProviders(d.api_providers);
					if (d.local.length > 0 && !selectedModel) {
						setSelectedModel(d.local[0].id);
					}
				})
				.catch(() => {});
		}
	}, [open, localModels.length, selectedModel]);

	const {
		messages,
		setMessages,
		input,
		setInput,
		isStreaming,
		setConversationId,
		attachments,
		isRecording,
		inputRef,
		fileInputRef,
		sendMessage,
		handleKeyDown,
		editMessage,
		deleteMessage,
		branchMessage,
		removeAttachment,
		startRecording,
		stopRecording,
		handleFileSelect,
		handleDragOver,
		handleDragLeave,
		handleDrop,
		harnessState,
	} = useAssistantChat({
		open,
		selectedModel,
		selectedProvider,
		apiKey,
		apiBaseUrl,
	});

	const projects = useAssistantProjects({
		view,
		setView,
		setMessages,
		setConversationId,
	});

	const assets = useAssistantAssets();

	if (!open) {
		return null;
	}

	return (
		<div
			role="application"
			aria-label="Assistant panel"
			className="h-full shrink-0 w-[480px] bg-background border-l border-border shadow-2xl flex flex-row animate-in slide-in-from-right"
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<nav
				aria-label="Assistant sections"
				className="flex flex-col items-center gap-1 py-3 border-r border-border bg-sidebar shrink-0"
			>
				{TABS.map(({ id, label, Icon }) => (
					<button
						key={id}
						type="button"
						title={label}
						aria-label={label}
						aria-pressed={view === id}
						onClick={() => setView(id)}
						className={`size-9 flex items-center justify-center rounded-lg transition-colors ${
							view === id
								? "bg-accent-muted text-accent"
								: "text-muted-foreground hover:bg-secondary hover:text-foreground"
						}`}
					>
						<Icon className="size-5" />
					</button>
				))}
			</nav>

			<div className="flex-1 flex flex-col min-w-0 overflow-hidden">
				<div className="flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar shrink-0">
					<div className="flex items-center gap-2">
						<Bot className="size-4 text-accent" />
						<span className="text-sm font-semibold tracking-wide">
							Otoyin Assistant
						</span>
					</div>
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() => setShowSettings(!showSettings)}
							title="Model & API settings"
							aria-label="Model and API settings"
						>
							<Key className="h-3.5 w-3.5" aria-hidden="true" />
						</Button>{" "}
						<VoiceChatOverlay />
						<ContextWindowIndicator harnessState={harnessState} />
						<Button
							variant="ghost"
							aria-label="Close assistant"
							size="icon"
							className="size-7"
							onClick={onClose}
							title="Close"
						>
							<X className="h-3.5 w-3.5" aria-hidden="true" />
						</Button>
					</div>
				</div>

				{showSettings && (
					<div className="shrink-0 max-h-[50vh] overflow-y-auto border-b border-border">
						<AssistantSettings
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
					</div>
				)}

				<div className="flex-1 min-h-0 overflow-hidden flex flex-col">
					{view === "chat" && (
						<AssistantChatView
							messages={messages}
							input={input}
							setInput={setInput}
							isStreaming={isStreaming}
							attachments={attachments}
							isRecording={isRecording}
							inputRef={inputRef}
							fileInputRef={fileInputRef}
							sendMessage={sendMessage}
							handleKeyDown={handleKeyDown}
							editMessage={editMessage}
							deleteMessage={deleteMessage}
							branchMessage={branchMessage}
							removeAttachment={removeAttachment}
							startRecording={startRecording}
							stopRecording={stopRecording}
							handleFileSelect={handleFileSelect}
							handleDragOver={handleDragOver}
							handleDragLeave={handleDragLeave}
							handleDrop={handleDrop}
						/>
					)}

					{(view === "projects" || view === "plan") && (
						<AssistantProjectPanel
							projects={projects.projects}
							activeProjectId={projects.activeProjectId}
							sources={projects.sources}
							plans={projects.plans}
							newProjectName={projects.newProjectName}
							setNewProjectName={projects.setNewProjectName}
							newProjectDesc={projects.newProjectDesc}
							setNewProjectDesc={projects.setNewProjectDesc}
							newSource={projects.newSource}
							setNewSource={projects.setNewSource}
							newPlan={projects.newPlan}
							setNewPlan={projects.setNewPlan}
							creatingProject={projects.creatingProject}
							addingSource={projects.addingSource}
							creatingPlan={projects.creatingPlan}
							selectingProject={projects.selectingProject}
							selectProject={projects.selectProject}
							createProject={projects.createProject}
							addSource={projects.addSource}
							removeSource={projects.removeSource}
							createPlan={projects.createPlan}
							setPlanStatus={projects.setPlanStatus}
							showProjects={view === "projects"}
							showPlan={view === "plan"}
						/>
					)}

					{view === "assets" && (
						<AssistantAssetsPanel
							assetsSource={assets.assetsSource}
							setAssetsSource={assets.setAssetsSource}
							assetsQuery={assets.assetsQuery}
							setAssetsQuery={assets.setAssetsQuery}
							assetsResults={assets.assetsResults}
							assetsBusy={assets.assetsBusy}
							assetsMsg={assets.assetsMsg}
							searchAssets={assets.searchAssets}
							downloadAsset={assets.downloadAsset}
						/>
					)}

					{view === "skills" && <SkillBuilder />}

					{view === "history" && (
						<AssistantHistoryPanel
							historyConvs={projects.historyConvs}
							loadingConversation={projects.loadingConversation}
							loadHistoryConversation={projects.loadHistoryConversation}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
