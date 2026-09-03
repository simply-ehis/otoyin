import { apiClient } from "@/lib/api/client";

export const DEMUCS_MODEL_NAME = "demucs_onnx";

export type DownloadState = "checking" | "downloading" | "ready" | "failed";

/**
 * Make sure a model is downloaded before a feature uses it.
 *
 * One-click flow: if the model is missing this triggers the download
 * (background task on the backend) and polls /models/status until the
 * weights are cached or the download fails. Returns immediately when the
 * model is already available.
 *
 * @returns `true` when the model had to be downloaded (was not ready).
 */
export async function ensureModelDownloaded(
	modelName: string,
	onState?: (state: DownloadState) => void,
	timeoutMs = 600_000,
): Promise<boolean> {
	onState?.("checking");
	const first = await apiClient.getModelStatus();
	const model = first.models.find((m) => m.model_name === modelName);
	if (!model) {
		throw new Error(`Unknown model "${modelName}"`);
	}
	if (model.downloaded) {
		onState?.("ready");
		return false;
	}

	onState?.("downloading");
	if (!model.downloading) {
		await apiClient.triggerModelDownload(modelName);
	}

	const deadline = Date.now() + timeoutMs;
	let quietPolls = 0;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 2500));
		const status = await apiClient.getModelStatus();
		const current = status.models.find((m) => m.model_name === modelName);
		if (current?.downloaded) {
			onState?.("ready");
			return true;
		}
		if (!current?.downloading) {
			quietPolls += 1;
			// Two consecutive quiet polls (≈5s) after a download was started
			// means the backend task finished without caching weights.
			if (quietPolls >= 2) {
				onState?.("failed");
				throw new Error(
					`Model "${modelName}" download failed — check your connection and try again.`,
				);
			}
		} else {
			quietPolls = 0;
		}
	}
	onState?.("failed");
	throw new Error(`Timed out waiting for model "${modelName}" to download.`);
}
