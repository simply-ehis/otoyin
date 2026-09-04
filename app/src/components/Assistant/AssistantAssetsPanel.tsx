import {
	ArrowDownTrayIcon as Download,
	MagnifyingGlassIcon as Search,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

interface AssistantAssetsPanelProps {
	assetsSource: "freesound" | "polyhaven";
	setAssetsSource: (v: "freesound" | "polyhaven") => void;
	assetsQuery: string;
	setAssetsQuery: (v: string) => void;
	assetsResults: Record<string, unknown>[];
	assetsBusy: boolean;
	assetsMsg: string;
	searchAssets: () => void;
	downloadAsset: (item: Record<string, unknown>) => void;
}

export function AssistantAssetsPanel({
	assetsSource,
	setAssetsSource,
	assetsQuery,
	setAssetsQuery,
	assetsResults,
	assetsBusy,
	assetsMsg,
	searchAssets,
	downloadAsset,
}: AssistantAssetsPanelProps) {
	return (
		<div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
			<div className="flex gap-1">
				<select
					value={assetsSource}
					onChange={(e) =>
						setAssetsSource(e.target.value as "freesound" | "polyhaven")
					}
					className="rounded-md border border-input bg-background px-2 py-1 text-xs"
				>
					<option value="freesound">Freesound</option>
					<option value="polyhaven">Poly Haven</option>
				</select>
				<input
					value={assetsQuery}
					onChange={(e) => setAssetsQuery(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && searchAssets()}
					aria-label="Search assets"
					placeholder="Search assets"
					className="flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm"
				/>
				<Button size="sm" onClick={searchAssets} disabled={assetsBusy}>
					<Search className="size-4" />
				</Button>
			</div>
			{assetsMsg && (
				<p className="text-xs text-muted-foreground">{assetsMsg}</p>
			)}
			<div className="space-y-2">
				{assetsResults.map((item, i) => (
					<div
						key={(item.id as string) ?? i}
						className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
					>
						<span className="text-sm truncate">
							{(item.name as string) ?? (item.id as string) ?? "Asset"}
						</span>
						<Button
							size="sm"
							variant="outline"
							disabled={assetsBusy}
							onClick={() => downloadAsset(item)}
						>
							<Download className="size-3.5 mr-1" /> Get
						</Button>
					</div>
				))}
				{!assetsBusy && assetsResults.length === 0 && !assetsMsg && (
					<p className="text-xs text-muted-foreground">
						Search Freesound or Poly Haven to acquire licensed assets into your
						library.
					</p>
				)}
			</div>
		</div>
	);
}
