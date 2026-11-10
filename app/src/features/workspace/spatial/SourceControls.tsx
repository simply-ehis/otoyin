import {
	MinusIcon,
	PlusIcon,
	SpeakerWaveIcon,
	SpeakerXMarkIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/ui/button";
import { Label } from "@/ui/primitives";
import { Slider } from "@/ui/slider";
import { Toggle } from "@/ui/toggle";
import { GenerationPicker } from "./GenerationPicker";
import type { SpatialSource } from "./types";

export interface SourceControlsProps {
	sources: SpatialSource[];
	onAdd: () => void;
	onRemove: (id: string) => void;
	onToggleMute: (id: string) => void;
	onUpdateGainDb: (id: string, gainDb: number) => void;
	onPickAudio: (
		sourceId: string,
		gen: {
			id: string;
			audio_path?: string;
			profile_name: string;
			text: string;
		},
	) => void;
}

const GAIN_MIN_DB = -30;
const GAIN_MAX_DB = 12;

/** One source row: pick its audio, set position/gain/mute, or remove it. */
function SourceRow({
	source,
	onToggleMute,
	onUpdateGainDb,
	onRemove,
	onPickAudio,
}: {
	source: SpatialSource;
	onToggleMute: (id: string) => void;
	onUpdateGainDb: (id: string, gainDb: number) => void;
	onRemove: (id: string) => void;
	onPickAudio: SourceControlsProps["onPickAudio"];
}) {
	const positionText = `(${Math.round(source.x)}, ${Math.round(source.y)})`;
	const gainText = `${source.gainDb >= 0 ? "+" : ""}${source.gainDb} dB`;

	return (
		<div
			key={source.id}
			className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
		>
			<GenerationPicker
				sourceId={source.id}
				selectedId={source.audioPath ? source.id : null}
				onSelect={(sid, gen) => onPickAudio(sid, gen)}
				className="flex-1"
			/>
			<Toggle
				pressed={!source.muted}
				onPressedChange={() => onToggleMute(source.id)}
				className="size-6 p-0"
				title={source.muted ? "Unmute" : "Mute"}
				aria-label={
					source.muted ? `Unmute ${source.label}` : `Mute ${source.label}`
				}
			>
				{source.muted ? (
					<SpeakerXMarkIcon className="size-3" aria-hidden="true" />
				) : (
					<SpeakerWaveIcon className="size-3" aria-hidden="true" />
				)}
			</Toggle>
			<div className="flex-1">
				<Label className="text-[10px] text-muted-foreground">Gain</Label>
				<Slider
					id={`spatial-gain-${source.id}`}
					min={GAIN_MIN_DB}
					max={GAIN_MAX_DB}
					step={1}
					value={[source.gainDb]}
					onValueChange={([v]) => onUpdateGainDb(source.id, v ?? 0)}
					aria-label={`Gain for ${source.label}`}
					className="h-2"
				/>
			</div>
			<span className="w-16 font-mono text-xs tabular-nums text-muted-foreground">
				{gainText}
			</span>
			<span className="w-20 font-mono text-xs tabular-nums text-muted-foreground truncate">
				{positionText}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="size-6 p-0"
				title={`Remove ${source.label}`}
				aria-label={`Remove ${source.label}`}
				onClick={() => onRemove(source.id)}
				disabled={/* keep at least one source */ false}
			>
				<TrashIcon className="size-3" aria-hidden="true" />
			</Button>
		</div>
	);
}

export function SourceControls({
	sources,
	onAdd,
	onRemove,
	onToggleMute,
	onUpdateGainDb,
	onPickAudio,
}: SourceControlsProps) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Label>
					Sources{" "}
					<span className="text-muted-foreground">({sources.length})</span>
				</Label>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="size-6 p-0"
					title="Add source"
					aria-label="Add source"
					onClick={onAdd}
				>
					<PlusIcon className="size-3" aria-hidden="true" />
				</Button>
				{sources.length <= 1 && (
					<MinusIcon
						className="size-3 text-muted-foreground/40"
						aria-hidden="true"
					/>
				)}
			</div>
			{sources.map((s) => (
				<SourceRow
					key={s.id}
					source={s}
					onToggleMute={onToggleMute}
					onUpdateGainDb={onUpdateGainDb}
					onRemove={onRemove}
					onPickAudio={onPickAudio}
				/>
			))}
			{sources.length === 0 && (
				<p className="px-2 py-2 text-center text-xs text-muted-foreground">
					Add a source, pick its audio, then drag it on the soundstage.
				</p>
			)}
		</div>
	);
}
