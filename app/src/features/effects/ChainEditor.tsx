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
	Bars3Icon,
	ChevronDownIcon,
	ChevronRightIcon,
	PlusIcon,
	PowerIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type { AvailableEffect, EffectConfig } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Label } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";

interface EffectWithId extends EffectConfig {
	uid: string;
}

let uidCounter = 0;
const nextUid = () => `fx-${++uidCounter}`;

/**
 * Sortable effects chain: presets, add/remove/bypass/reorder, per-param
 * sliders. Keyboard reorder via dnd-kit's sortable coordinates
 * (focus the grip, arrows move). Shared by inspector, studio, history.
 */
export const ChainEditor = memo(function ChainEditor({
	value,
	onChange,
	compact = false,
	showPresets = true,
}: {
	value: EffectConfig[];
	onChange: (chain: EffectConfig[]) => void;
	compact?: boolean;
	showPresets?: boolean;
}) {
	const { t } = useTranslation();
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const idsRef = useRef<string[]>([]);

	const items: EffectWithId[] = useMemo(() => {
		while (idsRef.current.length < value.length) {
			idsRef.current.push(nextUid());
		}
		if (idsRef.current.length > value.length) {
			idsRef.current = idsRef.current.slice(0, value.length);
		}
		return value.map((e, i) => ({ ...e, uid: idsRef.current[i] ?? nextUid() }));
	}, [value]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const { data: available } = useQuery({
		queryKey: ["available-effects"],
		queryFn: () => apiClient.getAvailableEffects(),
		staleTime: Infinity,
	});
	const { data: presets } = useQuery({
		queryKey: ["effect-presets"],
		queryFn: () => apiClient.listEffectPresets(),
		staleTime: 30_000,
	});

	const defs = useMemo(() => {
		const m = new Map<string, AvailableEffect>();
		for (const e of available?.effects ?? []) {
			m.set(e.type, e);
		}
		return m;
	}, [available]);

	const addEffect = useCallback(
		(type: string) => {
			const def = defs.get(type);
			if (!def) {
				return;
			}
			const params: Record<string, number> = {};
			for (const [key, p] of Object.entries(def.params)) {
				params[key] = p.default;
			}
			const uid = nextUid();
			idsRef.current = [...idsRef.current, uid];
			onChange([...value, { type, enabled: true, params }]);
			setExpandedId(uid);
		},
		[defs, value, onChange],
	);

	const removeAt = useCallback(
		(index: number) => {
			const removed = idsRef.current[index];
			idsRef.current = idsRef.current.filter((_, i) => i !== index);
			onChange(value.filter((_, i) => i !== index));
			if (expandedId === removed) {
				setExpandedId(null);
			}
		},
		[value, onChange, expandedId],
	);

	const toggleAt = useCallback(
		(index: number) => {
			onChange(
				value.map((e, i) => (i === index ? { ...e, enabled: !e.enabled } : e)),
			);
		},
		[value, onChange],
	);

	const setParam = useCallback(
		(index: number, name: string, v: number) => {
			onChange(
				value.map((e, i) =>
					i === index ? { ...e, params: { ...e.params, [name]: v } } : e,
				),
			);
		},
		[value, onChange],
	);

	const setTrim = useCallback(
		(index: number, field: "trim_start_ms" | "trim_end_ms", v: number) => {
			onChange(value.map((e, i) => (i === index ? { ...e, [field]: v } : e)));
		},
		[value, onChange],
	);

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) {
				return;
			}
			const from = idsRef.current.indexOf(active.id as string);
			const to = idsRef.current.indexOf(over.id as string);
			if (from === -1 || to === -1) {
				return;
			}
			idsRef.current = arrayMove(idsRef.current, from, to);
			onChange(arrayMove([...value], from, to));
		},
		[value, onChange],
	);

	return (
		<div className={cn("flex flex-col gap-2", compact && "text-sm")}>
			{showPresets ? (
				<div className="flex items-center gap-2">
					<Select
						onValueChange={(id) => {
							const preset = presets?.find((p) => p.id === id);
							if (preset) {
								idsRef.current = preset.effects_chain.map(() => nextUid());
								onChange(preset.effects_chain);
								setExpandedId(null);
							}
						}}
					>
						<SelectTrigger className="h-8 flex-1 text-xs">
							<SelectValue placeholder={t("effects.chain.loadPreset")} />
						</SelectTrigger>
						<SelectContent>
							{presets?.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.is_builtin
										? t(`effects.builtinPresets.${p.name}.name`, {
												defaultValue: p.name,
											})
										: p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{value.length > 0 ? (
						<Button
							variant="ghost"
							size="sm"
							className="h-8 px-2 text-xs text-muted-foreground"
							onClick={() => {
								idsRef.current = [];
								onChange([]);
								setExpandedId(null);
							}}
						>
							{t("effects.chain.clear")}
						</Button>
					) : null}
				</div>
			) : null}

			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={onDragEnd}
			>
				<SortableContext
					items={items.map((i) => i.uid)}
					strategy={verticalListSortingStrategy}
				>
					{items.map((effect, index) => (
						<ChainRow
							key={effect.uid}
							id={effect.uid}
							effect={effect}
							def={defs.get(effect.type)}
							expanded={expandedId === effect.uid}
							onToggleExpand={() =>
								setExpandedId(expandedId === effect.uid ? null : effect.uid)
							}
							onRemove={() => removeAt(index)}
							onToggle={() => toggleAt(index)}
							onParam={(name, v) => setParam(index, name, v)}
							onTrim={(field, v) => setTrim(index, field, v)}
						/>
					))}
				</SortableContext>
			</DndContext>

			{available ? (
				<Select onValueChange={addEffect}>
					<SelectTrigger className="h-8 border-dashed text-xs text-muted-foreground">
						<PlusIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
						<SelectValue placeholder={t("effects.chain.addEffect")} />
					</SelectTrigger>
					<SelectContent>
						{available.effects.map((e) => (
							<SelectItem key={e.type} value={e.type}>
								{t(`effects.types.${e.type}.label`, { defaultValue: e.label })}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : null}
		</div>
	);
});

function ChainRow({
	id,
	effect,
	def,
	expanded,
	onToggleExpand,
	onRemove,
	onToggle,
	onParam,
	onTrim,
}: {
	id: string;
	effect: EffectConfig;
	def?: AvailableEffect;
	expanded: boolean;
	onToggleExpand: () => void;
	onRemove: () => void;
	onToggle: () => void;
	onParam: (name: string, value: number) => void;
	onTrim?: (field: "trim_start_ms" | "trim_end_ms", v: number) => void;
}) {
	const { t } = useTranslation();
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });
	const label = t(`effects.types.${effect.type}.label`, {
		defaultValue: def?.label ?? effect.type,
	});

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				zIndex: isDragging ? 10 : undefined,
			}}
			className={cn(
				"rounded-md border",
				effect.enabled ? "border-border bg-card" : "border-border bg-secondary",
				isDragging && "opacity-80 shadow-lg",
			)}
		>
			<div className="flex items-center gap-1 px-2 py-1.5">
				<button
					type="button"
					onClick={onToggleExpand}
					title={expanded ? "Collapse effect" : "Expand effect"}
					aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
					aria-expanded={expanded}
					className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
				>
					{expanded ? (
						<ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
					) : (
						<ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
					)}
				</button>
				<button
					type="button"
					title="Drag to reorder"
					aria-label={`Reorder ${label}`}
					{...attributes}
					{...listeners}
					className="cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
				>
					<Bars3Icon className="h-3.5 w-3.5" aria-hidden="true" />
				</button>
				<span
					className={cn(
						"flex-1 text-xs font-medium",
						!effect.enabled && "text-muted-foreground",
					)}
				>
					{label}
				</span>
				<button
					type="button"
					onClick={onToggle}
					title={
						effect.enabled
							? t("effects.chain.disable")
							: t("effects.chain.enable")
					}
					aria-label={effect.enabled ? `Bypass ${label}` : `Enable ${label}`}
					aria-pressed={effect.enabled}
					className={cn(
						"rounded-sm p-0.5 transition-colors",
						effect.enabled
							? "text-accent"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<PowerIcon className="h-3.5 w-3.5" aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={onRemove}
					title={t("effects.chain.remove")}
					aria-label={`Remove ${label}`}
					className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-destructive"
				>
					<TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
				</button>
			</div>
			{expanded && def ? (
				<div className="flex flex-col gap-3 border-t border-border px-3 py-3">
					{Object.entries(def.params).map(([name, p]) => {
						const current = effect.params[name] ?? p.default;
						return (
							<div key={name}>
								<p className="mb-1 flex items-center justify-between">
									<Label className="text-xs text-muted-foreground">
										{t(`effects.types.${effect.type}.params.${name}`, {
											defaultValue: p.description,
										})}
									</Label>
									<span className="font-mono text-xs tabular-nums text-foreground">
										{current.toFixed(
											p.step < 1
												? Math.max(1, -Math.floor(Math.log10(p.step)))
												: 0,
										)}
									</span>
								</p>
								<Slider
									min={p.min}
									max={p.max}
									step={p.step}
									value={[current]}
									onValueChange={([v]) => onParam(name, v ?? current)}
									aria-label={`${label} ${name}`}
								/>
							</div>
						);
					})}
					{onTrim ? (
						<div className="mt-2 pt-2 border-t border-border">
							<p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
								{t("effects.chain.trimRegion")}
							</p>
							<div className="grid grid-cols-2 gap-2">
								<div>
									<Label className="text-xs text-muted-foreground block mb-1">
										{t("effects.chain.trimStart")}
									</Label>
									<input
										type="number"
										value={effect.trim_start_ms ?? 0}
										onChange={(e) =>
											onTrim(
												"trim_start_ms",
												Math.max(0, Number(e.target.value) || 0),
											)
										}
										className="w-full h-6 rounded-md border border-input bg-input px-2 text-xs"
										aria-label={t("effects.chain.trimStart")}
									/>
									<span className="text-[10px] text-muted-foreground">
										{t("effects.chain.trimStartMs")}
									</span>
								</div>
								<div>
									<Label className="text-xs text-muted-foreground block mb-1">
										{t("effects.chain.trimEnd")}
									</Label>
									<input
										type="number"
										value={effect.trim_end_ms ?? 0}
										onChange={(e) =>
											onTrim(
												"trim_end_ms",
												Math.max(0, Number(e.target.value) || 0),
											)
										}
										className="w-full h-6 rounded-md border border-input bg-input px-2 text-xs"
										aria-label={t("effects.chain.trimEnd")}
									/>
									<span className="text-[10px] text-muted-foreground">
										{t("effects.chain.trimEndMs")}
									</span>
								</div>
							</div>
							<p className="mt-1 text-[10px] text-muted-foreground">
								{t("effects.chain.trimHint")}
							</p>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
