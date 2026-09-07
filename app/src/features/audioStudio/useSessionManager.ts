import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_PROJECT_FAILED,
	ERR_TITLE_PROJECT,
} from "@/lib/errorMessages";
import { useToast } from "@/ui/use-toast";
import {
	type AudioStudioSnapshot,
	useAudioStudioStore,
} from "./AudioStudioStore";
import { PROJECT_TEMPLATES } from "./templates";

interface SavedSession {
	id: string;
	name: string;
	updated_at: string;
	data: unknown;
	created_at: string;
}

export function useSessionManager() {
	const { toast } = useToast();
	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [showLoadDialog, setShowLoadDialog] = useState(false);
	const [showTemplateDialog, setShowTemplateDialog] = useState(false);
	const [sessionName, setSessionName] = useState("");
	const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [isAutosave, setIsAutosave] = useState(false);
	const [unsaved, setUnsaved] = useState(false);
	const [canUndo, setCanUndo] = useState(false);
	const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const scheduleAutosave = useCallback(() => {
		if (autosaveTimer.current) {
			clearTimeout(autosaveTimer.current);
		}
		autosaveTimer.current = setTimeout(async () => {
			const store = useAudioStudioStore.getState();
			const sessionData = store.exportSession();
			try {
				if (!currentSessionId) {
					// First autosave — create the session + first snapshot
					const created = await apiClient.saveAudioStudioSession(
						"Autosave",
						sessionData,
					);
					setCurrentSessionId(created.id);
					setIsAutosave(true);
					await apiClient.createAutosaveSnapshot(created.id, sessionData);
				} else if (isAutosave) {
					// Rolling snapshot: insert new version (pruned to 5 by backend)
					await apiClient.createAutosaveSnapshot(currentSessionId, sessionData);
				} else {
					// Named session — still snapshot for undo before next named save
					await apiClient.createAutosaveSnapshot(currentSessionId, sessionData);
				}
				setUnsaved(true);
				setCanUndo(true);
			} catch (err) {
				debug.warn("AudioStudio autosave failed", err);
			}
		}, 1500);
	}, [currentSessionId, isAutosave]);

	useEffect(() => {
		const unsub = useAudioStudioStore.subscribe((state, prev) => {
			if (
				state.tracks !== prev.tracks ||
				state.masterVolume !== prev.masterVolume ||
				state.playbackSpeed !== prev.playbackSpeed ||
				state.markers !== prev.markers
			) {
				scheduleAutosave();
			}
		});
		return () => {
			unsub();
			if (autosaveTimer.current) {
				clearTimeout(autosaveTimer.current);
			}
		};
	}, [scheduleAutosave]);

	useEffect(() => {
		if (!unsaved) {
			return;
		}
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [unsaved]);

	const handleSaveSession = useCallback(async () => {
		const store = useAudioStudioStore.getState();
		const sessionData = store.exportSession();
		const name = sessionName || "Untitled Session";
		try {
			let result: SavedSession;
			if (currentSessionId && isAutosave) {
				// Promote: named save collapses undo history (backend deletes snapshots)
				result = await apiClient.promoteAudioStudioSession(
					currentSessionId,
					name,
					sessionData,
				);
				setIsAutosave(false);
			} else if (currentSessionId) {
				result = await apiClient.updateAudioStudioSession(
					currentSessionId,
					name,
					sessionData,
				);
			} else {
				result = await apiClient.saveAudioStudioSession(name, sessionData);
			}
			setCurrentSessionId(result.id);
			setUnsaved(false);
			setCanUndo(false);
			toast({ title: "Session saved", description: name });
			setShowSaveDialog(false);
		} catch (err) {
			toast({
				title: "Save failed",
				description: err instanceof Error ? err.message : "Unknown error",
				variant: "destructive",
			});
		}
	}, [currentSessionId, isAutosave, sessionName, toast]);

	const handleUndo = useCallback(async () => {
		if (!currentSessionId) {
			return;
		}
		try {
			const restored = await apiClient.undoAutosave(currentSessionId);
			const store = useAudioStudioStore.getState();
			store.importSession(restored.data as AudioStudioSnapshot);
			toast({ title: "Undone", description: "Restored previous autosave" });
			// Check if there are more snapshots to undo
			const snapshots = await apiClient.listAutosaveSnapshots(currentSessionId);
			setCanUndo(snapshots.length > 0);
		} catch (err) {
			toast({
				title: "Undo failed",
				description:
					err instanceof Error ? err.message : "No snapshots to undo",
				variant: "destructive",
			});
		}
	}, [currentSessionId, toast]);

	const handleLoadSession = useCallback(async () => {
		try {
			const sessions = await apiClient.listAudioStudioSessions();
			setSavedSessions(sessions);
			setShowLoadDialog(true);
		} catch (_err) {
			toast({
				title: ERR_TITLE_PROJECT,
				description: ERR_DESC_PROJECT_FAILED,
				variant: "destructive",
			});
		}
	}, [toast]);

	const doLoadSession = useCallback(
		async (sessionId: string) => {
			try {
				const session = await apiClient.getAudioStudioSession(sessionId);
				const store = useAudioStudioStore.getState();
				store.importSession(session.data);
				setCurrentSessionId(sessionId);
				setIsAutosave(false);
				setUnsaved(false);
				setCanUndo(false);
				toast({ title: "Session loaded", description: session.name });
				setShowLoadDialog(false);
			} catch (err) {
				toast({
					title: "Load failed",
					description: err instanceof Error ? err.message : "Unknown error",
					variant: "destructive",
				});
			}
		},
		[toast],
	);

	const doDeleteSession = useCallback(
		async (sessionId: string) => {
			try {
				await apiClient.deleteAudioStudioSession(sessionId);
				setSavedSessions((prev) => prev.filter((s) => s.id !== sessionId));
				if (currentSessionId === sessionId) {
					setCurrentSessionId(null);
					setIsAutosave(false);
				}
				toast({ title: "Session deleted" });
			} catch (err) {
				toast({
					title: "Delete failed",
					description: err instanceof Error ? err.message : "Unknown error",
					variant: "destructive",
				});
			}
		},
		[currentSessionId, toast],
	);

	const handleNewSession = useCallback(() => {
		setShowTemplateDialog(true);
	}, []);

	const doNewFromTemplate = useCallback(
		(templateIndex: number) => {
			const template = PROJECT_TEMPLATES[templateIndex];
			if (!template) {
				return;
			}
			const store = useAudioStudioStore.getState();
			store.resetToTemplate(template.snapshot);
			setCurrentSessionId(null);
			setIsAutosave(false);
			setUnsaved(false);
			setCanUndo(false);
			toast({ title: `New session: ${template.name}` });
		},
		[toast],
	);

	return {
		showSaveDialog,
		setShowSaveDialog,
		showLoadDialog,
		setShowLoadDialog,
		showTemplateDialog,
		setShowTemplateDialog,
		sessionName,
		setSessionName,
		savedSessions,
		unsaved,
		canUndo,
		canUndoAutosave: canUndo,
		handleSaveSession,
		handleLoadSession,
		handleNewSession,
		doLoadSession,
		doDeleteSession,
		doNewFromTemplate,
		handleUndo,
		onUndoAutosave: handleUndo,
	};
}

import { debug } from "@/lib/utils/debug";
