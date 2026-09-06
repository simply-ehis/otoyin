import {
	PowerIcon as Power,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils/cn";
import { type StudioTrack, useAudioStudioStore } from "./AudioStudioStore";
export function PluginChainPanel({ track }: { track: StudioTrack }) {
	const updateTrack = useAudioStudioStore((s) => s.updateTrack);

	const toggleChainItem = (index: number) => {
		const chain = [...(track.pluginChain ?? [])];
		chain[index] = { ...chain[index], enabled: !chain[index].enabled };
		updateTrack(track.id, { pluginChain: chain });
	};

	const removeChainItem = (index: number) => {
		const chain = [...(track.pluginChain ?? [])];
		chain.splice(index, 1);
		updateTrack(track.id, { pluginChain: chain });
	};

	const chain = track.pluginChain ?? [];

	if (chain.length === 0) {
		return (
			<div className="flex items-center justify-center py-2 text-xs text-muted-foreground/40 bg-sunken rounded mb-1">
				No plugins — add them in the Plugins view
			</div>
		);
	}

	return (
		<div className="space-y-0.5 mb-1">
			{chain.map((item, idx) => (
				<div
					key={item.pluginId}
					className="flex items-center gap-1 px-2 py-1 bg-sunken rounded text-xs"
				>
					<button
						type="button"
						onClick={() => toggleChainItem(idx)}
						title={item.enabled ? "Disable plugin" : "Enable plugin"}
						aria-label={item.enabled ? "Disable plugin" : "Enable plugin"}
						className={cn(
							"p-0.5 rounded",
							item.enabled ? "text-accent" : "text-muted-foreground/30",
						)}
					>
						<Power className="h-2.5 w-2.5" />
					</button>
					<span
						className={cn(
							"flex-1 truncate",
							!item.enabled && "line-through text-muted-foreground/50",
						)}
					>
						{item.pluginName}
					</span>
					<button
						type="button"
						onClick={() => removeChainItem(idx)}
						title="Remove plugin"
						aria-label="Remove plugin"
						className="text-muted-foreground hover:text-destructive"
					>
						<Trash2 className="h-2.5 w-2.5" />
					</button>
				</div>
			))}
		</div>
	);
}
