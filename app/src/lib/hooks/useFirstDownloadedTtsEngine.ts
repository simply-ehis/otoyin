import { useQueryClient } from "@tanstack/react-query";
import type { ModelStatusListResponse } from "@/lib/api/types";

/**
 * Return the first *downloaded* TTS engine from the live model-status cache.
 *
 * This mirrors the backend's "never assume a specific model exists" policy on
 * the frontend: callers use it to seed a default engine selection instead of
 * hardcoding "kokoro". Returns ``undefined`` when the user has not downloaded
 * any TTS engine yet, so the UI can prompt a download rather than silently
 * defaulting to a model that may not be installed.
 */
export function firstDownloadedTtsEngine(
	modelStatus: ModelStatusListResponse | undefined,
): string | undefined {
	const downloaded = (modelStatus?.models ?? [])
		.filter((m) => m.downloaded && m.category === "tts" && m.engine)
		.map((m) => m.engine as string);
	return downloaded[0];
}

export function useFirstDownloadedTtsEngine(): string | undefined {
	const queryClient = useQueryClient();
	const modelStatus = queryClient.getQueryData<ModelStatusListResponse>([
		"modelStatus",
	]);
	return firstDownloadedTtsEngine(modelStatus);
}

/**
 * All *downloaded* TTS engines from the live model-status cache, in list form.
 * Used to seed the set of engines a picker offers — never a hardcoded catalog.
 * Returns ``[]`` when the user has not downloaded any TTS engine yet, so the
 * UI can show an explainable empty state instead of assuming a model exists.
 */
export function downloadedTtsEngines(
	modelStatus: ModelStatusListResponse | undefined,
): string[] {
	return (modelStatus?.models ?? [])
		.filter((m) => m.downloaded && m.category === "tts" && m.engine)
		.map((m) => m.engine as string);
}

export function useDownloadedTtsEngines(): string[] {
	const queryClient = useQueryClient();
	const modelStatus = queryClient.getQueryData<ModelStatusListResponse>([
		"modelStatus",
	]);
	return downloadedTtsEngines(modelStatus);
}
