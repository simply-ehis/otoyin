import {
	ChevronDownIcon as ChevronDown,
	PowerIcon as Power,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Slider } from "@/ui/slider";
import { type StudioTrack, useAudioStudioStore } from "./AudioStudioStore";

interface ParamMeta {
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
}

const PARAM_META: Record<string, Record<string, ParamMeta>> = {
	eq: {
		low_gain: { label: "Bass", min: -12, max: 12, step: 1, unit: "dB" },
		mid_gain: { label: "Mid", min: -12, max: 12, step: 1, unit: "dB" },
		high_gain: { label: "Treble", min: -12, max: 12, step: 1, unit: "dB" },
	},
	compressor: {
		threshold: {
			label: "Threshold",
			min: -60,
			max: 0,
			step: 1,
			unit: "dB",
		},
		ratio: { label: "Ratio", min: 1, max: 20, step: 1, unit: ":1" },
		attack: { label: "Attack", min: 1, max: 100, step: 1, unit: "ms" },
		release: { label: "Release", min: 10, max: 1000, step: 10, unit: "ms" },
	},
	reverb: {
		mix: { label: "Mix", min: 0, max: 1, step: 0.05, unit: "" },
	},
	delay: {
		time: { label: "Time", min: 0.05, max: 1, step: 0.05, unit: "s" },
		feedback: { label: "Feedback", min: 0, max: 0.9, step: 0.05, unit: "" },
		mix: { label: "Mix", min: 0, max: 1, step: 0.05, unit: "" },
	},
	gain: {
		gain: { label: "Gain", min: 0, max: 2, step: 0.05, unit: "" },
	},
};

function ParamSlider({
	pluginId,
	paramKey,
	value,
	onChange,
}: {
	pluginId: string;
	paramKey: string;
	value: number;
	onChange: (v: number) => void;
}) {
	const id = pluginId.replace(/^builtin-/, "");
	const meta = PARAM_META[id]?.[paramKey];
	if (!meta) {
		return null;
	}
	return (
		<div className="flex items-center gap-2 px-1">
			<span className="text-[10px] text-muted-foreground w-12 shrink-0 text-right">
				{meta.label}
			</span>
			<Slider
				min={meta.min}
				max={meta.max}
				step={meta.step}
				value={[value]}
				onValueChange={([v]) => onChange(v)}
				className="flex-1 h-4"
				aria-label={meta.label}
			/>
			<span className="text-[10px] tabular-nums text-muted-foreground w-10 text-left">
				{value > 0 && meta.unit !== ":1" ? "+" : ""}
				{Number.isInteger(meta.step) ? value : value.toFixed(1)}
				{meta.unit}
			</span>
		</div>
	);
}

function PluginItem({
	item,
	onToggle,
	onRemove,
	onUpdateParams,
}: {
	item: StudioTrack["pluginChain"][number];
	onToggle: () => void;
	onRemove: () => void;
	onUpdateParams: (params: Record<string, number>) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const id = item.pluginId.replace(/^builtin-/, "");
	const paramKeys = Object.keys(PARAM_META[id] ?? {});
	const hasParams = paramKeys.length > 0;

	return (
		<div className="bg-sunken rounded">
			<div className="flex items-center gap-1 px-2 py-1">
				<button
					type="button"
					onClick={onToggle}
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
						"flex-1 truncate text-xs",
						!item.enabled && "line-through text-muted-foreground/50",
					)}
				>
					{item.pluginName}
				</span>
				{hasParams && (
					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						aria-label={expanded ? "Collapse parameters" : "Expand parameters"}
						className="p-0.5 text-muted-foreground hover:text-foreground"
					>
						<ChevronDown
							className={cn(
								"h-2.5 w-2.5 transition-transform",
								expanded && "rotate-180",
							)}
						/>
					</button>
				)}
				<button
					type="button"
					onClick={onRemove}
					title="Remove plugin"
					aria-label="Remove plugin"
					className="text-muted-foreground hover:text-destructive"
				>
					<Trash2 className="h-2.5 w-2.5" />
				</button>
			</div>
			{expanded && hasParams && (
				<div className="flex flex-col gap-1 px-2 pb-1.5">
					{paramKeys.map((pk) => (
						<ParamSlider
							key={pk}
							pluginId={item.pluginId}
							paramKey={pk}
							value={item.params[pk] ?? 0}
							onChange={(v) => onUpdateParams({ ...item.params, [pk]: v })}
						/>
					))}
				</div>
			)}
		</div>
	);
}

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

	const updateParams = (index: number, params: Record<string, number>) => {
		const chain = [...(track.pluginChain ?? [])];
		chain[index] = { ...chain[index], params };
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
				<PluginItem
					key={`${item.pluginId}-${idx}`}
					item={item}
					onToggle={() => toggleChainItem(idx)}
					onRemove={() => removeChainItem(idx)}
					onUpdateParams={(p) => updateParams(idx, p)}
				/>
			))}
		</div>
	);
}
