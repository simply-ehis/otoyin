import {
	ChevronDownIcon as ChevronDown,
	PlusIcon as Plus,
	PowerIcon as Power,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
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

interface PluginCatalogEntry {
	id: string;
	name: string;
	defaults: Record<string, number>;
}

const PLUGIN_CATALOG: PluginCatalogEntry[] = [
	{
		id: "builtin-eq",
		name: "EQ",
		defaults: { low_gain: 0, mid_gain: 0, high_gain: 0 },
	},
	{
		id: "builtin-compressor",
		name: "Compressor",
		defaults: { threshold: -24, ratio: 12, attack: 3, release: 250 },
	},
	{
		id: "builtin-reverb",
		name: "Reverb",
		defaults: { mix: 0.3 },
	},
	{
		id: "builtin-delay",
		name: "Delay",
		defaults: { time: 0.3, feedback: 0.3, mix: 0.5 },
	},
	{
		id: "builtin-gain",
		name: "Gain",
		defaults: { gain: 1.0 },
	},
];

type PluginChainSnapshot = StudioTrack["pluginChain"];

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

function AddPluginDropdown({
	onAdd,
}: {
	onAdd: (entry: PluginCatalogEntry) => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	return (
		<div ref={ref} className="relative">
			<Button
				variant="ghost"
				size="sm"
				className="h-6 w-full text-[10px] text-muted-foreground hover:text-foreground"
				onClick={() => setOpen(!open)}
			>
				<Plus className="size-3 mr-1" />
				Add Plugin
			</Button>
			{open && (
				<>
					<button
						type="button"
						tabIndex={-1}
						className="fixed inset-0 z-40 cursor-default"
						onClick={() => setOpen(false)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setOpen(false);
							}
						}}
						aria-label="Close plugin menu"
					/>
					<div className="absolute bottom-full left-0 mb-1 z-50 bg-card border border-border rounded-md shadow-lg p-1 min-w-[140px]">
						{PLUGIN_CATALOG.map((entry) => (
							<button
								key={entry.id}
								type="button"
								className="w-full text-left px-2 py-1 text-xs hover:bg-secondary rounded-sm"
								onClick={() => {
									onAdd(entry);
									setOpen(false);
								}}
							>
								{entry.name}
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}

export function PluginChainPanel({ track }: { track: StudioTrack }) {
	const updateTrack = useAudioStudioStore((s) => s.updateTrack);
	const pushUndo = useAudioStudioStore((s) => s.pushUndo);
	const [abSlot, setAbSlot] = useState<"a" | "b">("a");
	const [snapshotA, setSnapshotA] = useState<PluginChainSnapshot>(null);
	const [snapshotB, setSnapshotB] = useState<PluginChainSnapshot>(null);

	const toggleChainItem = (index: number) => {
		pushUndo(`Toggle ${track.pluginChain[index]?.pluginName ?? "plugin"}`);
		const chain = [...(track.pluginChain ?? [])];
		chain[index] = { ...chain[index], enabled: !chain[index].enabled };
		updateTrack(track.id, { pluginChain: chain });
	};

	const removeChainItem = (index: number) => {
		const name = track.pluginChain[index]?.pluginName ?? "plugin";
		pushUndo(`Remove ${name}`);
		const chain = [...(track.pluginChain ?? [])];
		chain.splice(index, 1);
		updateTrack(track.id, { pluginChain: chain });
	};

	const updateParams = (index: number, params: Record<string, number>) => {
		const chain = [...(track.pluginChain ?? [])];
		chain[index] = { ...chain[index], params };
		updateTrack(track.id, { pluginChain: chain });
	};

	const addPlugin = (entry: PluginCatalogEntry) => {
		pushUndo(`Add ${entry.name}`);
		const newItem: StudioTrack["pluginChain"][number] = {
			pluginId: entry.id,
			pluginName: entry.name,
			enabled: true,
			params: { ...entry.defaults },
		};
		updateTrack(track.id, {
			pluginChain: [...(track.pluginChain ?? []), newItem],
		});
	};

	const saveAbSlot = () => {
		const chain = track.pluginChain ?? [];
		if (abSlot === "a") {
			setSnapshotA(JSON.parse(JSON.stringify(chain)));
		} else {
			setSnapshotB(JSON.parse(JSON.stringify(chain)));
		}
	};

	const applyAbSlot = (slot: "a" | "b") => {
		const snapshot = slot === "a" ? snapshotA : snapshotB;
		if (!snapshot) {
			return;
		}
		pushUndo(`Apply ${slot.toUpperCase()} compare`);
		updateTrack(track.id, {
			pluginChain: JSON.parse(JSON.stringify(snapshot)),
		});
		setAbSlot(slot);
	};

	const chain = track.pluginChain ?? [];

	return (
		<div className="space-y-0.5 mb-1">
			{(snapshotA || snapshotB) && (
				<div className="flex items-center gap-1 px-1 py-0.5">
					<span className="text-[9px] text-muted-foreground mr-0.5">A/B</span>
					<button
						type="button"
						onClick={() => applyAbSlot("a")}
						disabled={!snapshotA}
						className={cn(
							"px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors",
							abSlot === "a"
								? "bg-accent text-accent-foreground"
								: snapshotA
									? "bg-muted text-muted-foreground hover:bg-secondary"
									: "bg-muted/50 text-muted-foreground/30 cursor-not-allowed",
						)}
					>
						A
					</button>
					<button
						type="button"
						onClick={() => applyAbSlot("b")}
						disabled={!snapshotB}
						className={cn(
							"px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors",
							abSlot === "b"
								? "bg-accent text-accent-foreground"
								: snapshotB
									? "bg-muted text-muted-foreground hover:bg-secondary"
									: "bg-muted/50 text-muted-foreground/30 cursor-not-allowed",
						)}
					>
						B
					</button>
					<button
						type="button"
						onClick={saveAbSlot}
						className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground rounded bg-muted hover:bg-secondary transition-colors"
						title={`Save current chain to slot ${abSlot.toUpperCase()}`}
					>
						Save
					</button>
				</div>
			)}
			{chain.map((item, idx) => (
				<PluginItem
					key={`${item.pluginId}-${idx}`}
					item={item}
					onToggle={() => toggleChainItem(idx)}
					onRemove={() => removeChainItem(idx)}
					onUpdateParams={(p) => updateParams(idx, p)}
				/>
			))}
			<AddPluginDropdown onAdd={addPlugin} />
			{chain.length > 0 && !snapshotA && !snapshotB && (
				<button
					type="button"
					onClick={saveAbSlot}
					className="w-full text-[9px] text-muted-foreground/50 hover:text-muted-foreground py-0.5 transition-colors"
				>
					Save A to compare
				</button>
			)}
		</div>
	);
}
