import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ChevronDownIcon as ChevronDown,
	ChevronRightIcon as ChevronRight,
	Bars3Icon as GripVertical,
	PlusIcon as Plus,
	PowerIcon as Power,
	AdjustmentsHorizontalIcon as SlidersHorizontal,
	SparklesIcon as Sparkles,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ABComparison } from "@/components/ABComparison/ABComparison";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { apiClient } from "@/lib/api/client";
import type { EffectConfig } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { useEffectsStore } from "@/stores/effectsStore";

interface EffectWithId extends EffectConfig {
	_id: string;
}

let nextId = 0;
function makeId() {
	return `fx-${++nextId}`;
}

export function EffectsView() {
	const queryClient = useQueryClient();
	const [chain, setChain] = useState<EffectConfig[]>([]);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [ids, setIds] = useState<string[]>([]);
	const selectedPresetId = useEffectsStore((s) => s.selectedPresetId);
	const setSelectedPresetId = useEffectsStore((s) => s.setSelectedPresetId);

	const {
		data: effectsData,
		isLoading: effectsLoading,
		isError: effectsError,
	} = useQuery({
		queryKey: ["available-effects"],
		queryFn: () => apiClient.getAvailableEffects(),
		staleTime: Infinity,
	});

	const { data: presets } = useQuery({
		queryKey: ["effect-presets"],
		queryFn: () => apiClient.listEffectPresets(),
		staleTime: 30_000,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: loadPreset is stable, adding it causes re-render loop
	useEffect(() => {
		if (selectedPresetId && presets) {
			loadPreset(selectedPresetId);
			setSelectedPresetId(null);
		}
	}, [selectedPresetId, presets, setSelectedPresetId]);

	const items: EffectWithId[] = chain.map((e, i) => ({
		...e,
		_id: ids[i] || makeId(),
	}));
	const effectsMap = new Map(
		effectsData?.effects.map((e) => [e.type, e]) ?? [],
	);

	function addEffect(type: string) {
		const def = effectsMap.get(type);
		if (!def) {
			return;
		}
		const params: Record<string, number> = {};
		for (const [k, p] of Object.entries(def.params)) {
			params[k] = p.default;
		}
		const newId = makeId();
		setIds([...ids, newId]);
		setChain([...chain, { type, enabled: true, params }]);
		setExpandedId(newId);
	}

	function removeEffect(index: number) {
		setIds(ids.filter((_, i) => i !== index));
		setChain(chain.filter((_, i) => i !== index));
	}

	function toggleEnabled(index: number) {
		setChain(
			chain.map((e, i) => (i === index ? { ...e, enabled: !e.enabled } : e)),
		);
	}

	function updateParam(index: number, name: string, value: number) {
		setChain(
			chain.map((e, i) =>
				i === index ? { ...e, params: { ...e.params, [name]: value } } : e,
			),
		);
	}

	function loadPreset(presetId: string) {
		const preset = presets?.find((p) => p.id === presetId);
		if (!preset) {
			return;
		}
		const newIds = preset.effects_chain.map(() => makeId());
		setIds(newIds);
		setChain(preset.effects_chain);
		setExpandedId(null);
	}

	const savePresetMutation = useMutation({
		mutationFn: (name: string) =>
			apiClient.createEffectPreset({
				name,
				effects_chain: chain,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["effect-presets"] });
		},
	});

	function handleSavePreset() {
		if (chain.length === 0) {
			return;
		}
		const name = window.prompt("Preset name:");
		if (!name) {
			return;
		}
		savePresetMutation.mutate(name);
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id) {
			return;
		}
		const oldIndex = ids.indexOf(active.id as string);
		const newIndex = ids.indexOf(over.id as string);
		if (oldIndex === -1 || newIndex === -1) {
			return;
		}
		setIds(arrayMove(ids, oldIndex, newIndex));
		setChain(arrayMove([...chain], oldIndex, newIndex));
	}

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	return (
		<div className="flex flex-col h-full p-4 gap-3">
			<ScreenHeader
				icon={<SlidersHorizontal className="size-5" />}
				title="Effects Chain"
				description="Stack and tune real-time audio effects"
			/>
			<div className="flex items-center gap-2">
				<Select onValueChange={loadPreset}>
					<SelectTrigger className="h-8 flex-1 text-xs">
						<SelectValue placeholder="Load preset" />
					</SelectTrigger>
					<SelectContent>
						{presets?.map((p) => (
							<SelectItem key={p.id} value={p.id}>
								{p.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant="outline"
					size="sm"
					className="h-8 text-xs"
					title="Save current chain as preset"
					aria-label="Save preset"
					onClick={handleSavePreset}
					disabled={chain.length === 0 || savePresetMutation.isPending}
				>
					Save Preset
				</Button>
			</div>

			<Separator />

			{effectsLoading ? (
				<LoadingState label="Loading effects…" />
			) : effectsError ? (
				<EmptyState
					variant="error"
					icon={<Sparkles />}
					title="Failed to load effects"
					description="Something went wrong while fetching available effects."
				/>
			) : (
				<>
					{chain.length === 0 ? (
						<EmptyState
							icon={<Sparkles />}
							title="No effects added yet"
							description="Use the dropdown below to add effects."
						/>
					) : (
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleDragEnd}
						>
							<SortableContext
								items={items.map((i) => i._id)}
								strategy={verticalListSortingStrategy}
							>
								<div className="space-y-2 flex-1 overflow-y-auto">
									{items.map((effect, index) => {
										const def = effectsMap.get(effect.type);
										return (
											<SortableEffectItem
												key={effect._id}
												id={effect._id}
												effect={effect}
												effectDef={def}
												isExpanded={expandedId === effect._id}
												onToggleExpand={() =>
													setExpandedId(
														expandedId === effect._id ? null : effect._id,
													)
												}
												onRemove={() => removeEffect(index)}
												onToggleEnabled={() => toggleEnabled(index)}
												onUpdateParam={(n, v) => updateParam(index, n, v)}
											/>
										);
									})}
								</div>
							</SortableContext>
						</DndContext>
					)}

					{effectsData && (
						<Select onValueChange={addEffect}>
							<SelectTrigger className="h-8 border-dashed text-xs text-muted-foreground">
								<Plus className="mr-1 h-3.5 w-3.5" />
								<SelectValue placeholder="Add effect" />
							</SelectTrigger>
							<SelectContent>
								{effectsData.effects.map((e) => (
									<SelectItem key={e.type} value={e.type}>
										{e.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</>
			)}

			{chain.length > 0 && (
				<ABComparison
					originalAudioPath=""
					processedAudioPath=""
					currentTime={0}
					onPlay={() => {}}
					onStop={() => {}}
				/>
			)}
		</div>
	);
}

function SortableEffectItem({
	id,
	effect,
	effectDef,
	isExpanded,
	onToggleExpand,
	onRemove,
	onToggleEnabled,
	onUpdateParam,
}: {
	id: string;
	effect: EffectConfig;
	effectDef?: {
		label?: string;
		params: Record<
			string,
			{
				default: number;
				min: number;
				max: number;
				step: number;
				description: string;
			}
		>;
	};
	isExpanded: boolean;
	onToggleExpand: () => void;
	onRemove: () => void;
	onToggleEnabled: () => void;
	onUpdateParam: (name: string, value: number) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id,
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		zIndex: isDragging ? 10 : undefined,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"rounded-md border",
				effect.enabled
					? "border-border bg-card"
					: "border-border/50 bg-muted/30",
				isDragging && "opacity-80 shadow-lg",
			)}
		>
			<div className="flex items-center gap-1 px-2 py-1.5">
				<button
					type="button"
					className="p-0.5 text-muted-foreground hover:text-foreground"
					onClick={onToggleExpand}
					title={isExpanded ? "Collapse effect" : "Expand effect"}
					aria-label={isExpanded ? "Collapse effect" : "Expand effect"}
				>
					{isExpanded ? (
						<ChevronDown className="h-3.5 w-3.5" />
					) : (
						<ChevronRight className="h-3.5 w-3.5" />
					)}
				</button>
				<button
					type="button"
					className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
					title="Drag to reorder"
					aria-label="Drag to reorder"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="h-3.5 w-3.5" />
				</button>
				<span
					className={cn(
						"flex-1 text-xs font-medium",
						!effect.enabled && "text-muted-foreground",
					)}
				>
					{effectDef?.label ?? effect.type}
				</span>
				<button
					type="button"
					className={cn(
						"p-0.5 transition-colors",
						effect.enabled
							? "text-accent"
							: "text-muted-foreground hover:text-foreground",
					)}
					onClick={onToggleEnabled}
					title={effect.enabled ? "Disable effect" : "Enable effect"}
					aria-label={effect.enabled ? "Disable effect" : "Enable effect"}
				>
					<Power className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					className="p-0.5 text-destructive/60 hover:text-destructive"
					onClick={onRemove}
					title="Remove effect"
					aria-label="Remove effect"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
			{isExpanded && effectDef && (
				<div className="space-y-3 border-t px-3 py-3">
					{Object.entries(effectDef.params).map(([name, param]) => {
						const val = effect.params[name] ?? param.default;
						return (
							<div key={name} className="space-y-1">
								<div className="flex items-center justify-between">
									<Label className="text-xs text-muted-foreground">
										{param.description}
									</Label>
									<span className="text-xs font-mono tabular-nums text-foreground">
										{val.toFixed(
											param.step < 1
												? Math.max(1, -Math.floor(Math.log10(param.step)))
												: 0,
										)}
									</span>
								</div>
								<Slider
									min={param.min}
									max={param.max}
									step={param.step}
									value={[val]}
									onValueChange={([v]) => onUpdateParam(name, v)}
								/>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
