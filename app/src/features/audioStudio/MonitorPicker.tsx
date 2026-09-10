import {
	SpeakerWaveIcon as Volume2,
	SpeakerXMarkIcon as VolumeX,
} from "@heroicons/react/24/outline";
import { type AudioSourceKind, useAudioBus } from "@/lib/audio/audioBus";
import { Slider } from "@/ui/slider";
import { IconButton } from "@/ui/tooltip";

const KIND_LABEL: Record<AudioSourceKind, string> = {
	file: "Voiceover",
	mic: "Microphone",
	system: "System audio",
	assistant: "Assistant",
	video: "Video",
};

interface MonitorPickerProps {
	/** Restrict which source kinds are selectable as monitor. */
	allowedKinds?: AudioSourceKind[];
	/** Heading shown above the picker. */
	title?: string;
}

export function MonitorPicker({
	allowedKinds,
	title = "Monitor source",
}: MonitorPickerProps) {
	const sources = useAudioBus((s) => s.sources);
	const monitor = useAudioBus((s) => s.monitor);
	const setMonitorSource = useAudioBus((s) => s.setMonitorSource);
	const setMonitorVolume = useAudioBus((s) => s.setMonitorVolume);
	const setSourceVolume = useAudioBus((s) => s.setSourceVolume);
	const setSourceMuted = useAudioBus((s) => s.setSourceMuted);

	const list = Object.values(sources).filter(
		(s) => !allowedKinds || allowedKinds.includes(s.kind),
	);

	return (
		<div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
			<div className="flex items-center justify-between">
				<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					{title}
				</span>
				<button
					type="button"
					className="text-[10px] text-muted-foreground hover:text-foreground"
					title="Clear monitor"
					onClick={() => setMonitorSource(null)}
				>
					Off
				</button>
			</div>

			{list.length === 0 ? (
				<p className="text-[10px] text-muted-foreground">
					No live sources
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{list.map((src) => {
						const isMonitor = monitor.sourceId === src.id;
						return (
							<div key={src.id} className="flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<button
										type="button"
										className={cnRow(isMonitor)}
										title={`Monitor ${src.label}`}
										onClick={() => setMonitorSource(isMonitor ? null : src.id)}
									>
										<span className="size-2 rounded-full bg-rose-500/70" />
										<span className="truncate text-xs">{src.label}</span>
										<span className="ml-auto text-xs text-muted-foreground">
											{KIND_LABEL[src.kind]}
										</span>
									</button>
									<IconButton
										label={
											src.muted ? `Unmute ${src.label}` : `Mute ${src.label}`
										}
										onClick={() => setSourceMuted(src.id, !src.muted)}
									>
										{src.muted ? <VolumeX /> : <Volume2 />}
									</IconButton>
								</div>
								<Slider
									value={[src.muted ? 0 : src.volume]}
									min={0}
									max={1}
									step={0.01}
									onValueChange={(v) => setSourceVolume(src.id, v[0])}
									aria-label={`${src.label} volume`}
								/>
							</div>
						);
					})}
				</div>
			)}

			{monitor.sourceId && (
				<div className="flex items-center gap-2 border-t border-border pt-2">
					<span className="text-xs uppercase text-muted-foreground">
						Monitor out
					</span>
					<Slider
						value={[monitor.volume]}
						min={0}
						max={1}
						step={0.01}
						onValueChange={(v) => setMonitorVolume(v[0])}
						aria-label="Monitor volume"
					/>
				</div>
			)}
		</div>
	);
}

function cnRow(active: boolean) {
	return [
		"flex items-center gap-2 rounded px-2 py-1 text-left flex-1",
		active ? "bg-accent-muted ring-1 ring-accent/40" : "hover:bg-muted",
	].join(" ");
}
