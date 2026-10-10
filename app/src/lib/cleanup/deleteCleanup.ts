import type { QueryClient } from "@tanstack/react-query";
import { usePlayerStore } from "@/stores/playerStore";
import { useUIStore } from "@/stores/uiStore";

/**
 * Full frontend cleanup after a voice profile is deleted.
 * Clears react-query caches, persisted selections, and player state so the
 * UI never keeps fetching or playing a profile that no longer exists.
 */
export function clearDeletedProfileState(
	queryClient: QueryClient,
	profileId: string,
): void {
	// Drop list + single-profile + samples caches under ["profiles", ...]
	queryClient.removeQueries({
		predicate: (q) =>
			q.queryKey[0] === "profiles" &&
			(q.queryKey[1] === profileId || q.queryKey[1] === undefined),
	});
	queryClient.invalidateQueries({ queryKey: ["profiles"] });

	const ui = useUIStore.getState();
	if (ui.selectedProfileId === profileId) {
		ui.setSelectedProfileId(null);
	}
	if (ui.selectedVoiceId === profileId) {
		ui.setSelectedVoiceId(null);
	}
	if (ui.editingProfileId === profileId) {
		ui.setEditingProfileId(null);
	}

	const player = usePlayerStore.getState();
	if (player.profileId === profileId) {
		player.reset();
	}
}

/**
 * Full frontend cleanup after a generation is deleted.
 * Stops the player if it was playing that generation and drops detail cache.
 */
export function clearDeletedGenerationState(
	queryClient: QueryClient,
	generationId: string,
): void {
	queryClient.removeQueries({
		predicate: (q) =>
			q.queryKey[0] === "history" && q.queryKey[1] === generationId,
	});
	queryClient.invalidateQueries({ queryKey: ["history"] });

	const player = usePlayerStore.getState();
	if (player.audioId === generationId) {
		player.reset();
	}
}

/**
 * Wipe every cached server-backed query and local selection after a
 * privacy delete-all. React-query caches and persisted UI state would
 * otherwise keep stale profiles/models/history alive and re-fetch them.
 */
export function clearAllAppDataState(queryClient: QueryClient): void {
	queryClient.clear();

	const ui = useUIStore.getState();
	ui.setSelectedProfileId(null);
	ui.setSelectedVoiceId(null);
	ui.setEditingProfileId(null);
	ui.setSelectedEngine("");
	ui.setProfileFormDraft(null);

	usePlayerStore.getState().reset();
}
