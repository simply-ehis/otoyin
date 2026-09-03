import { create } from "zustand";
import { getSharedContext } from "@/lib/hooks/useAudioPlayer";

export type AudioSourceKind = "file" | "mic" | "system" | "assistant" | "video";

export interface AudioSource {
	id: string;
	label: string;
	kind: AudioSourceKind;
	gainNode: GainNode;
	outputNode: AudioNode;
	volume: number;
	muted: boolean;
	isLive: boolean;
	dispose: () => void;
}

export interface MonitorSelection {
	sourceId: string | null;
	volume: number;
}

interface AudioBusState {
	sources: Record<string, AudioSource>;
	monitor: MonitorSelection;
	registerSource: (source: AudioSource) => void;
	connectSourceOutput: (id: string, outputNode: AudioNode) => void;
	unregisterSource: (id: string) => void;
	setSourceVolume: (id: string, volume: number) => void;
	setSourceMuted: (id: string, muted: boolean) => void;
	setMonitorSource: (id: string | null) => void;
	setMonitorVolume: (volume: number) => void;
	getSourceList: () => AudioSource[];
	getMonitorSource: () => AudioSource | null;
}

function safeDispose(source: AudioSource | undefined) {
	if (!source) {
		return;
	}
	try {
		source.gainNode.disconnect();
		source.outputNode.disconnect();
	} catch {
		/* node already detached */
	}
	source.dispose();
}

export const useAudioBus = create<AudioBusState>((set, get) => ({
	sources: {},
	monitor: { sourceId: null, volume: 1 },

	registerSource: (source) => {
		const ctx = getSharedContext();
		if (!ctx) {
			return;
		}
		const existing = get().sources[source.id];
		if (existing) {
			safeDispose(existing);
		}
		source.gainNode.gain.value = source.muted ? 0 : source.volume;
		source.gainNode.connect(ctx.destination);
		// Async sources (e.g. mic) may register before their output node exists;
		// call connectSourceOutput() once the output node is ready.
		if (source.outputNode) {
			source.outputNode.connect(source.gainNode);
		}
		set((state) => ({ sources: { ...state.sources, [source.id]: source } }));
	},

	connectSourceOutput: (id, outputNode) => {
		const source = get().sources[id];
		if (!source) {
			return;
		}
		try {
			outputNode.connect(source.gainNode);
		} catch {
			// Already connected or node detached
		}
		set((state) => ({
			sources: {
				...state.sources,
				[id]: { ...state.sources[id], outputNode },
			},
		}));
	},

	unregisterSource: (id) => {
		const source = get().sources[id];
		safeDispose(source);
		set((state) => {
			const next = { ...state.sources };
			delete next[id];
			const monitor =
				state.monitor.sourceId === id
					? { sourceId: null, volume: state.monitor.volume }
					: state.monitor;
			return { sources: next, monitor };
		});
	},

	setSourceVolume: (id, volume) => {
		const source = get().sources[id];
		if (!source) {
			return;
		}
		if (!source.muted) {
			source.gainNode.gain.value = volume;
		}
		set((state) => ({
			sources: {
				...state.sources,
				[id]: { ...state.sources[id], volume },
			},
		}));
	},

	setSourceMuted: (id, muted) => {
		const source = get().sources[id];
		if (!source) {
			return;
		}
		source.gainNode.gain.value = muted ? 0 : source.volume;
		set((state) => ({
			sources: {
				...state.sources,
				[id]: { ...state.sources[id], muted },
			},
		}));
	},

	setMonitorSource: (id) =>
		set((state) => ({ monitor: { ...state.monitor, sourceId: id } })),

	setMonitorVolume: (volume) =>
		set((state) => ({ monitor: { ...state.monitor, volume } })),

	getSourceList: () => Object.values(get().sources),

	getMonitorSource: () => {
		const { monitor, sources } = get();
		return monitor.sourceId ? (sources[monitor.sourceId] ?? null) : null;
	},
}));
