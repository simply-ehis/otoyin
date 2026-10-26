import {
	CpuChipIcon as Bot,
	KeyIcon as Key,
	XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { VoiceChatOverlay } from "@/features/voiceChat/VoiceChatOverlay";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/ui/button";
import { AssistantAssetsPanel } from "./AssistantAssetsPanel";
import { AssistantChatView } from "./AssistantChatView";
import { AssistantHistoryPanel } from "./AssistantHistoryPanel";
import type { ApiProvider, LocalModel, TabId } from "./AssistantPanel.types";
import { TABS } from "./AssistantPanel.types";
import { AssistantProjectPanel } from "./AssistantProjectPanel";
import { AssistantSettings } from "./AssistantSettings";
import { clampAssistantWidth } from "./assistantWidth";
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
	const [localModels, setLocalModels] = useState<LocalModel[]>([]);
	const [apiProviders, setApiProviders] = useState<ApiProvider[]>([]);
	const [selectedModel, setSelectedModel] = useState("");
	const [selectedProvider, setSelectedProvider] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [apiBaseUrl, setApiBaseUrl] = useState("");
	const [showSettings, setShowSettings] = useState(false);
	const [view, setView] = useState<TabId>("chat");

	const [useCloudModel, setUseCloudModel] = useState<boolean>(() => {
		try {
			return localStorage.getItem("otoyin.assistant.useCloudModel") === "1";
		} catch {
			return false;
		}
	});
	const toggleCloudModel = () => {
		setUseCloudModel((v) => {
			const next = !v;
			try {
				localStorage.setItem("otoyin.assistant.useCloudModel", next ? "1" : "0");
			} catch {
				/* ignore */
			}
			return next;
		});
	};

	// Panel width lives in uiStore (persisted). A stored width from a bigger
	// screen can overfill a smaller one, so it is re-clamped on open.
	const assistantWidth = useUIStore((s) => s.assistantWidth);
	const setAssistantWidth = useUIStore((s) => s.setAssistantWidth);
	useEffect(() => {
		if (!open) {
			return;
		}
		setAssistantWidth(
			clampAssistantWidth(
				useUIStore.getState().assistantWidth,
				window.innerWidth,
			),
		);
	}, [open, setAssistantWidth]);

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
				.catch((error) => {
					showStudioErrorToast(error);
				});
		}
	}, [open, localModels.length, selectedModel]);

	const {
		messages,
		setMessages,
		input,
		setInput,
		isStreaming,
		historyLoading,
		setConversationId,
		attachments,
		isRecording,
		inputRef,
		fileInputRef,
		sendMessage,
		stopStreaming,
		handleKeyDown,
		editMessage,
		saveEditMessage,
		cancelEditMessage,
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
		useCloudModel,
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

	// Dragging the left edge: panel sits on the right of the window, so moving
	// the pointer left makes it wider and the main content reflows smaller.
	const startWidthResize = (e: React.MouseEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = assistantWidth;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		const onMove = (ev: MouseEvent) => {
			setAssistantWidth(
				clampAssistantWidth(
					startWidth + (startX - ev.clientX),
					window.innerWidth,
				),
			);
		};
		const onUp = () => {
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	return (
		<div
			role="application"
			aria-label="Assistant panel"
			className="relative h-full shrink-0 bg-background border-l border-border shadow-2xl flex flex-row animate-in slide-in-from-right"
			style={{ width: assistantWidth }}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<hr
				aria-orientation="vertical"
				aria-label="Resize assistant panel"
				tabIndex={0}
				className="absolute top-0 left-0 h-full w-1 -ml-0.5 cursor-col-resize hover:w-1.5 hover:bg-border bg-transparent transition-[width,background-color] touch-none border-none focus-visible:outline-none focus-visible:bg-accent z-20"
				onKeyDown={(e) => {
					const step = e.shiftKey ? 64 : 24;
					if (e.key === "ArrowLeft") {
						e.preventDefault();
						setAssistantWidth(
							clampAssistantWidth(assistantWidth - step, window.innerWidth),
						);
					} else if (e.key === "ArrowRight") {
						e.preventDefault();
						setAssistantWidth(
							clampAssistantWidth(assistantWidth + step, window.innerWidth),
						);
					}
				}}
				onMouseDown={startWidthResize}
			/>
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
							variant={useCloudModel ? "default" : "ghost"}
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={toggleCloudModel}
							title="Use cloud model"
						>
							{useCloudModel ? "Cloud" : "Local"}
						</Button>
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
							historyLoading={historyLoading}
							attachments={attachments}
							isRecording={isRecording}
							inputRef={inputRef}
							fileInputRef={fileInputRef}
							sendMessage={sendMessage}
							stopStreaming={stopStreaming}
							handleKeyDown={handleKeyDown}
							editMessage={editMessage}
							saveEditMessage={saveEditMessage}
							cancelEditMessage={cancelEditMessage}
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
							loadingHistory={projects.loadingHistory}
							loadHistoryConversation={projects.loadHistoryConversation}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
