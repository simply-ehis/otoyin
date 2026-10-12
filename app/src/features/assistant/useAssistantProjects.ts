import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type {
	AgentPlan,
	AgentProject,
	AgentProjectSource,
} from "@/lib/api/clientAgents";
import { showStudioErrorToast } from "@/lib/errors";
import { debug } from "@/lib/utils/debug";
import type { Msg, TabId } from "./AssistantPanel.types";
import { makeId } from "./AssistantPanel.types";

interface UseAssistantProjectsOptions {
	view: TabId;
	setView: (v: TabId) => void;
	setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
	setConversationId: (v: string | null) => void;
}

export function useAssistantProjects({
	view,
	setView,
	setMessages,
	setConversationId,
}: UseAssistantProjectsOptions) {
	const [projects, setProjects] = useState<AgentProject[]>([]);
	const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
	const [sources, setSources] = useState<AgentProjectSource[]>([]);
	const [plans, setPlans] = useState<AgentPlan[]>([]);
	const [newProjectName, setNewProjectName] = useState("");
	const [newProjectDesc, setNewProjectDesc] = useState("");
	const [newSource, setNewSource] = useState({
		name: "",
		type: "url",
		url: "",
	});
	const [newPlan, setNewPlan] = useState({ title: "", steps: "" });
	const [creatingProject, setCreatingProject] = useState(false);
	const [addingSource, setAddingSource] = useState(false);
	const [creatingPlan, setCreatingPlan] = useState(false);
	const [loadingConversation, setLoadingConversation] = useState(false);
	const [loadingHistory, setLoadingHistory] = useState(false);
	const [selectingProject, setSelectingProject] = useState(false);
	const [historyConvs, setHistoryConvs] = useState<
		Array<{ id: string; name?: string; updated_at?: string }>
	>([]);

	const loadProjects = useCallback(() => {
		apiClient
			.listProjects()
			.then(setProjects)
			.catch(() => showStudioErrorToast(new Error("Failed to load projects")));
	}, []);

	const selectProject = useCallback((id: string) => {
		setActiveProjectId(id);
		setSelectingProject(true);
		Promise.all([
			apiClient.listSources(id).then(setSources),
			apiClient.listPlans(id).then(setPlans),
		])
			.catch((err) => {
				debug.warn("[assistant] list sources/plans failed:", err);
			})
			.finally(() => setSelectingProject(false));
	}, []);

	useEffect(() => {
		if (view === "projects") {
			loadProjects();
		} else if (view === "history") {
			setLoadingHistory(true);
			apiClient
				.listConversations("assistant", 30)
				.then((c) =>
					setHistoryConvs(
						c as Array<{ id: string; name?: string; updated_at?: string }>,
					),
				)
				.catch((err) => {
					debug.warn("[assistant] list history failed:", err);
				})
				.finally(() => setLoadingHistory(false));
		}
	}, [view, loadProjects]);

	const createProject = useCallback(async () => {
		const name = newProjectName.trim();
		if (!name) {
			return;
		}
		setCreatingProject(true);
		try {
			const p = await apiClient.createAgentProject(
				name,
				newProjectDesc.trim() || undefined,
			);
			setNewProjectName("");
			setNewProjectDesc("");
			setProjects((prev) => [...prev, p]);
			selectProject(p.id);
		} catch {
			showStudioErrorToast(new Error("Failed to create project"));
		} finally {
			setCreatingProject(false);
		}
	}, [newProjectName, newProjectDesc, selectProject]);

	const addSource = useCallback(async () => {
		if (!activeProjectId || !newSource.name.trim()) {
			return;
		}
		setAddingSource(true);
		try {
			const s = await apiClient.addSource(
				activeProjectId,
				newSource.name.trim(),
				newSource.type,
				newSource.type === "url"
					? newSource.url.trim() || undefined
					: undefined,
			);
			setSources((prev) => [...prev, s]);
			setNewSource({ name: "", type: "url", url: "" });
		} catch {
			showStudioErrorToast(new Error("Failed to add source"));
		} finally {
			setAddingSource(false);
		}
	}, [activeProjectId, newSource]);

	const removeSource = useCallback(
		(sourceId: string) => {
			if (!activeProjectId) {
				return;
			}
			apiClient
				.removeSource(activeProjectId, sourceId)
				.then(() => setSources((prev) => prev.filter((x) => x.id !== sourceId)))
				.catch((err) => {
					debug.warn("[assistant] remove source failed:", err);
				});
		},
		[activeProjectId],
	);

	const createPlan = useCallback(async () => {
		if (!activeProjectId || !newPlan.title.trim()) {
			return;
		}
		const steps = newPlan.steps
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean)
			.map((text) => ({ text }));
		setCreatingPlan(true);
		try {
			const p = await apiClient.createPlan(activeProjectId, {
				title: newPlan.title.trim(),
				steps,
			});
			setPlans((prev) => [...prev, p]);
			setNewPlan({ title: "", steps: "" });
		} catch {
			showStudioErrorToast(new Error("Failed to create plan"));
		} finally {
			setCreatingPlan(false);
		}
	}, [activeProjectId, newPlan]);

	const setPlanStatus = useCallback(
		async (planId: string, status: string) => {
			if (!activeProjectId) {
				return;
			}
			try {
				const updated = await apiClient.updatePlanStatus(
					activeProjectId,
					planId,
					status,
				);
				setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
			} catch {
				showStudioErrorToast(new Error("Failed to update plan"));
			}
		},
		[activeProjectId],
	);

	const loadHistoryConversation = useCallback(
		(id: string) => {
			setLoadingConversation(true);
			apiClient
				.getHistory(id, 50)
				.then((history) => {
					if (history && history.length > 0) {
						setMessages(
							history.map((m) => ({
								id: makeId(),
								serverId: m.id,
								role: m.role as Msg["role"],
								content: m.content,
							})),
						);
						setConversationId(id);
						setView("chat");
					}
				})
				.catch(() =>
					showStudioErrorToast(new Error("Failed to load conversation")),
				)
				.finally(() => setLoadingConversation(false));
		},
		[setMessages, setConversationId, setView],
	);

	return {
		projects,
		activeProjectId,
		sources,
		plans,
		newProjectName,
		setNewProjectName,
		newProjectDesc,
		setNewProjectDesc,
		newSource,
		setNewSource,
		newPlan,
		setNewPlan,
		creatingProject,
		addingSource,
		creatingPlan,
		loadingConversation,
		loadingHistory,
		selectingProject,
		historyConvs,
		loadProjects,
		selectProject,
		createProject,
		addSource,
		removeSource,
		createPlan,
		setPlanStatus,
		loadHistoryConversation,
	};
}
