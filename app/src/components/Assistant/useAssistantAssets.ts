import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";

export function useAssistantAssets() {
	const [assetsSource, setAssetsSource] = useState<"freesound" | "polyhaven">(
		"freesound",
	);
	const [assetsQuery, setAssetsQuery] = useState("");
	const [assetsResults, setAssetsResults] = useState<Record<string, unknown>[]>(
		[],
	);
	const [assetsBusy, setAssetsBusy] = useState(false);
	const [assetsMsg, setAssetsMsg] = useState("");

	const searchAssets = useCallback(async () => {
		const q = assetsQuery.trim();
		if (!q) {
			return;
		}
		setAssetsBusy(true);
		setAssetsMsg("");
		setAssetsResults([]);
		try {
			const res = (await apiClient.acquireSearch(
				assetsSource,
				q,
				20,
				"all",
			)) as Record<string, unknown>;
			const results = Array.isArray(res)
				? res
				: ((res?.results as Record<string, unknown>[]) ?? []);
			setAssetsResults(results);
		} catch (e) {
			setAssetsMsg(e instanceof Error ? e.message : "Search failed");
		} finally {
			setAssetsBusy(false);
		}
	}, [assetsSource, assetsQuery]);

	const downloadAsset = useCallback(
		async (item: Record<string, unknown>) => {
			setAssetsBusy(true);
			setAssetsMsg("");
			try {
				let payload: Parameters<typeof apiClient.acquireDownload>[0];
				if (assetsSource === "freesound") {
					const previews = (item.previews as Record<string, string>) || {};
					const url =
						previews["preview-hq-mp3"] ||
						previews["preview-lq-mp3"] ||
						(item.preview_url as string) ||
						(item.url as string) ||
						(item.download as string) ||
						undefined;
					payload = {
						source: "freesound",
						url,
						filename: (item.name as string) ?? undefined,
					};
				} else {
					payload = {
						source: "polyhaven",
						asset_id: item.id as string,
						asset_type: (item.type as string) ?? "all",
						filename: (item.name as string) ?? (item.id as string),
					};
				}
				const res = await apiClient.acquireDownload(payload);
				setAssetsMsg(`Saved to ${res.local_path}`);
			} catch (e) {
				setAssetsMsg(e instanceof Error ? e.message : "Download failed");
			} finally {
				setAssetsBusy(false);
			}
		},
		[assetsSource],
	);

	return {
		assetsSource,
		setAssetsSource,
		assetsQuery,
		setAssetsQuery,
		assetsResults,
		assetsBusy,
		assetsMsg,
		searchAssets,
		downloadAsset,
	};
}
