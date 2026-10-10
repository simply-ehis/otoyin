import {
	ChevronDownIcon as ChevronDown,
	PlusIcon as Plus,
	PowerIcon as Power,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/ui/button";
import { Slider } from "@/ui/slider";
import { type StudioTrack, useAudioStudioStore } from "./AudioStudioStore";
import { EQ_BANDS, eqBandResponse } from "./buildEffectChain";
import {
	NATIVE_PREVIEW_IDS,
	type ParamMeta,
	type PluginCatalogEntry,
	usePluginCatalog,
} from "./pluginCatalog";

type PluginChainSnapshot = StudioTrack["pluginChain"];

const BAND_COLORS = ["#ff6b86", "#58d6c7", "#9b8cff", "#ffb454"];

function EqResponseCanvas({ params }: { params: Record<string, number> }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	// Redraw on theme change: --accent is read at draw time, so the curve
	// must re-render when the active theme swaps its triplet.
	const theme = useUIStore((s) => s.theme);

	// biome-ignore lint/correctness/useExhaustiveDependencies: theme forces a redraw when the active theme swaps the --accent triplet this callback resolves at draw time
	const draw = useCallback(
		(canvas: HTMLCanvasElement) => {
			const { width, height } = canvas;
			const ctx2d = canvas.getContext("2d");
			if (!ctx2d) {
				return;
			}
			ctx2d.clearRect(0, 0, width, height);

			const padding = { top: 4, bottom: 14, left: 24, right: 4 };
			const plotW = width - padding.left - padding.right;
			const plotH = height - padding.top - padding.bottom;

			// Grid lines
			ctx2d.strokeStyle = "rgba(128,128,128,0.15)";
			ctx2d.lineWidth = 0.5;
			for (let db = -12; db <= 12; db += 6) {
				const y = padding.top + plotH / 2 - (db / 12) * (plotH / 2);
				ctx2d.beginPath();
				ctx2d.moveTo(padding.left, y);
				ctx2d.lineTo(width - padding.right, y);
				ctx2d.stroke();
			}

			// Compute combined response
			const nPoints = plotW;
			const response = new Float32Array(nPoints);
			const logMin = Math.log10(20);
			const logMax = Math.log10(20000);

			for (let i = 0; i < nPoints; i++) {
				const logFreq = logMin + (i / nPoints) * (logMax - logMin);
				const freq = 10 ** logFreq;
				let total = 0;
				for (const band of EQ_BANDS) {
					const freqKey = `${band.key}_freq`;
					const gainKey = `${band.key}_gain`;
					const qKey = `${band.key}_q`;
					const f = (params[freqKey] as number) ?? band.defaultFreq;
					const g = (params[gainKey] as number) ?? 0;
					const q = (params[qKey] as number) ?? band.defaultQ;
					total += eqBandResponse(freq, f, g, q, band.type);
				}
				response[i] = total;
			}

			// Draw response curve. Canvas ignores CSS custom properties, so the
			// bare --accent triplet (theme-aware via --theme-accent) is wrapped
			// here instead.
			ctx2d.beginPath();
			const accent = getComputedStyle(canvas)
				.getPropertyValue("--accent")
				.trim();
			ctx2d.strokeStyle = accent ? `hsl(${accent})` : "hsl(348 68% 58%)";
			ctx2d.lineWidth = 1.5;
			for (let i = 0; i < nPoints; i++) {
				const x = padding.left + i;
				const clampedDb = Math.max(-12, Math.min(12, response[i]));
				const y = padding.top + plotH / 2 - (clampedDb / 12) * (plotH / 2);
				if (i === 0) {
					ctx2d.moveTo(x, y);
				} else {
					ctx2d.lineTo(x, y);
				}
			}
			ctx2d.stroke();

			// Draw band dots
			for (let b = 0; b < EQ_BANDS.length; b++) {
				const band = EQ_BANDS[b];
				const f = (params[`${band.key}_freq`] as number) ?? band.defaultFreq;
				const g = (params[`${band.key}_gain`] as number) ?? 0;
				const logF = Math.log10(f);
				const x = padding.left + ((logF - logMin) / (logMax - logMin)) * plotW;
				const y =
					padding.top +
					plotH / 2 -
					(Math.max(-12, Math.min(12, g)) / 12) * (plotH / 2);
				ctx2d.beginPath();
				ctx2d.arc(x, y, 3, 0, Math.PI * 2);
				ctx2d.fillStyle = BAND_COLORS[b];
				ctx2d.fill();
			}

			// Frequency labels
			ctx2d.fillStyle = "rgba(128,128,128,0.5)";
			ctx2d.font = "8px monospace";
			ctx2d.textAlign = "center";
			for (const hz of [100, 1000, 10000]) {
				const logF = Math.log10(hz);
				const x = padding.left + ((logF - logMin) / (logMax - logMin)) * plotW;
				ctx2d.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, x, height - 2);
			}
		},
		[params, theme],
	);

	const refCallback = useCallback(
		(canvas: HTMLCanvasElement | null) => {
			(canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current =
				canvas;
			if (canvas) {
				const dpr = window.devicePixelRatio || 1;
				const rect = canvas.getBoundingClientRect();
				canvas.width = rect.width * dpr;
				canvas.height = rect.height * dpr;
				const ctx2d = canvas.getContext("2d");
				if (ctx2d) {
					ctx2d.scale(dpr, dpr);
				}
				draw(canvas);
			}
		},
		[draw],
	);

	return (
		<canvas
			ref={refCallback}
			className="w-full h-16 rounded bg-sunken/50"
			aria-label="EQ frequency response"
		/>
	);
}

function ParamSlider({
	value,
	meta,
	onChange,
}: {
	value: number;
	meta: ParamMeta | undefined;
	onChange: (v: number) => void;
}) {
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
	paramsMeta,
	onToggle,
	onRemove,
	onUpdateParams,
}: {
	item: StudioTrack["pluginChain"][number];
	paramsMeta: Record<string, ParamMeta>;
	onToggle: () => void;
	onRemove: () => void;
	onUpdateParams: (params: Record<string, number>) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const id = item.pluginId.replace(/^builtin-/, "");
	const paramKeys = Object.keys(paramsMeta);
	const hasParams = paramKeys.length > 0;
	const livePreview = NATIVE_PREVIEW_IDS.has(item.pluginId);

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
				{!livePreview && (
					<span
						className="shrink-0 rounded border border-border px-1 text-[9px] text-muted-foreground"
						title="No live preview — apply via backend render (bounce)"
					>
						R
					</span>
				)}
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
					{id === "eq" && <EqResponseCanvas params={item.params} />}
					{paramKeys.map((pk) => (
						<ParamSlider
							key={pk}
							value={item.params[pk] ?? 0}
							meta={paramsMeta[pk]}
							onChange={(v) => onUpdateParams({ ...item.params, [pk]: v })}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function AddPluginDropdown({
	entries,
	onAdd,
}: {
	entries: PluginCatalogEntry[];
	onAdd: (entry: PluginCatalogEntry) => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const live = entries.filter((e) => NATIVE_PREVIEW_IDS.has(e.id));
	const renderOnly = entries.filter((e) => !NATIVE_PREVIEW_IDS.has(e.id));

	const renderEntry = (entry: PluginCatalogEntry) => (
		<button
			key={entry.id}
			type="button"
			className="w-full text-left px-2 py-1 text-xs hover:bg-secondary rounded-sm flex items-center gap-1.5"
			onClick={() => {
				onAdd(entry);
				setOpen(false);
			}}
		>
			<span className="flex-1 truncate">{entry.name}</span>
			{!NATIVE_PREVIEW_IDS.has(entry.id) && (
				<span
					className="shrink-0 rounded border border-border px-1 text-[9px] text-muted-foreground"
					title="No live preview — apply via backend render (bounce)"
				>
					R
				</span>
			)}
		</button>
	);

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
					<div className="absolute bottom-full left-0 mb-1 z-50 bg-card border border-border rounded-md shadow-lg p-1 min-w-[160px] max-h-64 overflow-y-auto">
						<div className="px-2 py-1 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
							Live preview
						</div>
						{live.map(renderEntry)}
						{renderOnly.length > 0 && (
							<>
								<div className="px-2 py-1 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
									Backend render
								</div>
								{renderOnly.map(renderEntry)}
							</>
						)}
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
	const [snapshotA, setSnapshotA] = useState<PluginChainSnapshot | null>(null);
	const [snapshotB, setSnapshotB] = useState<PluginChainSnapshot | null>(null);

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
	const catalog = usePluginCatalog();
	const typeOf = (pluginId: string) => pluginId.replace(/^builtin-/, "");

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
					paramsMeta={catalog.paramMeta[typeOf(item.pluginId)] ?? {}}
					onToggle={() => toggleChainItem(idx)}
					onRemove={() => removeChainItem(idx)}
					onUpdateParams={(p) => updateParams(idx, p)}
				/>
			))}
			<AddPluginDropdown entries={catalog.entries} onAdd={addPlugin} />
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
