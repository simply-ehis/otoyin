import type { MutableRefObject } from "react";
import { create } from "zustand";
import type { IsolationStem } from "@/features/workspace/VocalIsolationView";

export interface AutomationPoint {
	time: number;
	value: number;
}

export interface PluginChainItem {
	pluginId: string;
	pluginName: string;
	enabled: boolean;
	params: Record<string, number>;
}

export interface TrackGroup {
	id: string;
	name: string;
	collapsed: boolean;
}

export interface CrossfadeInfo {
	targetTrackId: string;
	durationMs: number;
}

export interface TimelineMarker {
	id: string;
	time: number;
	label: string;
}

export interface TempoChange {
	time: number;
	bpm: number;
}

export interface Submix {
	id: string;
	name: string;
	sourceTrackIds: string[];
	volume: number;
	pluginChain: PluginChainItem[];
}

export interface MasterChannel {
	volume: number;
	busSendLevels: Record<string, number>; // trackId -> send level
	duckingEnabled: boolean;
	duckThreshold: number;
	duckGain: number;
}

export interface StudioTrack {
	id: string;
	name: string;
	muted: boolean;
	solo: boolean;
	volume: number;
	pan: number;
	audioUrl: string | null;
	audioBlob: Blob | null;
	duration: number;
	waveformData: Float32Array | null;
	color: string;
	showSpectrogram: boolean;
	/** Separated stem for this track (set by stem isolation), if any. */
	stem: IsolationStem | null;
	channels: number; // decoded channel count (1 mono, 2 stereo, >2 multichannel)
	pluginChain: PluginChainItem[];
	volumeAutomation: AutomationPoint[];
	panAutomation: AutomationPoint[];
	crossfade: CrossfadeInfo | null;
	startOffset: number;
	trimStart: number;
	trimEnd: number;
	midiNotes: number[];
	submixId: string | null;
	generationId: string | null; // backend generation ID for transcript editing
	groupId: string | null;
	sidechainSourceId: string | null;
	expanded: boolean;
}

export interface AudioStudioSnapshot {
	tracks: StudioTrack[];
	groups: TrackGroup[];
	masterVolume: number;
	playbackSpeed: number;
	isLooping: boolean;
	submixes: Submix[];
	masterChannel: MasterChannel;
	markers: TimelineMarker[];
	tempoMap: TempoChange[];
	timeSignature: [number, number];
}

interface UndoEntry {
	snapshot: AudioStudioSnapshot;
	description: string;
	/** Restores state the snapshot cannot hold (the decoded-AudioBuffer
	 *  playback cache lives in a ref) when this entry is applied by undo. */
	onUndo?: () => void;
	/** Mirror of onUndo for redo — re-installs the post-mutation cache entry. */
	onRedo?: () => void;
}

interface AudioStudioStore {
	tracks: StudioTrack[];
	groups: TrackGroup[];
	submixes: Submix[];
	masterChannel: MasterChannel;
	isPlaying: boolean;
	isRecording: boolean;
	isLooping: boolean;
	currentTime: number;
	masterVolume: number;
	playbackSpeed: number;
	recordingTrackIndex: number | null;
	zoomLevel: number;
	showAutomation: boolean;
	markers: TimelineMarker[];

	undoStack: UndoEntry[];
	redoStack: UndoEntry[];
	tempoMap: TempoChange[];
	timeSignature: [number, number];

	addTrack: (name?: string) => string;
	duplicateTrack: (id: string) => string | null;
	removeTrack: (id: string) => void;
	moveTrack: (fromIndex: number, toIndex: number) => void;
	updateTrack: (id: string, updates: Partial<StudioTrack>) => void;
	setTracks: (tracks: StudioTrack[]) => void;
	setTrackAudio: (
		id: string,
		audioUrl: string,
		blob: Blob,
		duration: number,
	) => void;

	addSubmix: (name: string) => string;
	removeSubmix: (id: string) => void;
	updateSubmix: (id: string, updates: Partial<Submix>) => void;
	setSubmixes: (submixes: Submix[]) => void;

	addGroup: (name: string) => string;
	removeGroup: (id: string) => void;
	renameGroup: (id: string, name: string) => void;
	toggleGroupCollapse: (id: string) => void;
	assignTrackToGroup: (trackId: string, groupId: string | null) => void;
	toggleGroupMute: (groupId: string) => void;
	toggleGroupSolo: (groupId: string) => void;
	toggleTrackExpanded: (trackId: string) => void;

	setIsPlaying: (playing: boolean) => void;
	setIsRecording: (recording: boolean) => void;
	setIsLooping: (looping: boolean) => void;
	setCurrentTime: (time: number) => void;
	/** Mutable ref for high-frequency time updates — read in rAF, not zustand subscriptions. */
	currentTimeRef: MutableRefObject<number>;
	setMasterVolume: (volume: number) => void;
	setPlaybackSpeed: (speed: number) => void;
	setRecordingTrackIndex: (index: number | null) => void;
	setZoomLevel: (level: number) => void;
	setShowAutomation: (show: boolean) => void;
	addMarker: (time: number, label?: string) => void;
	removeMarker: (id: string) => void;
	updateMarker: (id: string, updates: Partial<TimelineMarker>) => void;

	addTempoChange: (time: number, bpm: number) => void;
	removeTempoChange: (index: number) => void;
	setTimeSignature: (num: number, den: number) => void;
	getBpmAtTime: (time: number) => number;

	toggleMute: (id: string) => void;
	toggleSolo: (id: string) => void;
	setVolume: (id: string, volume: number) => void;
	setPan: (id: string, pan: number) => void;

	toggleDucking: () => void;
	setDuckingThreshold: (threshold: number) => void;
	setDuckingGain: (gain: number) => void;
	setMasterBusSend: (trackId: string, level: number) => void;

	pushUndo: (
		description: string,
		onUndo?: () => void,
		onRedo?: () => void,
	) => void;
	undo: () => void;
	redo: () => void;

	exportSession: () => AudioStudioSnapshot;
	importSession: (snapshot: AudioStudioSnapshot) => void;
	reset: () => void;
	resetToTemplate: (snapshot: AudioStudioSnapshot) => void;
}

let trackIdCounter = 0;
let submixIdCounter = 0;
let groupIdCounter = 0;

function generateTrackId(): string {
	trackIdCounter += 1;
	return `studio-track-${trackIdCounter}-${Date.now()}`;
}

function generateSubmixId(): string {
	submixIdCounter += 1;
	return `submix-${submixIdCounter}`;
}

function generateGroupId(): string {
	groupIdCounter += 1;
	return `group-${groupIdCounter}`;
}

function takeSnapshot(get: () => AudioStudioStore): AudioStudioSnapshot {
	const s = get();
	return {
		// Strip waveformData (recomputable peaks) so 30 undo entries don't pin
		// large Float32Arrays; audioBlob refs are kept so undo restores audio.
		tracks: s.tracks.map((t) => ({ ...t, waveformData: null })),
		groups: s.groups.map((g) => ({ ...g })),
		masterVolume: s.masterVolume,
		playbackSpeed: s.playbackSpeed,
		isLooping: s.isLooping,
		submixes: s.submixes.map((smx) => ({ ...smx })),
		masterChannel: { ...s.masterChannel },
		markers: s.markers,
		tempoMap: s.tempoMap.map((tc) => ({ ...tc })),
		timeSignature: [...s.timeSignature],
	};
}

export const useAudioStudioStore = create<AudioStudioStore>((set, get) => ({
	tracks: [],
	groups: [],
	submixes: [],
	masterChannel: {
		volume: 1,
		busSendLevels: {},
		duckingEnabled: false,
		duckThreshold: -30,
		duckGain: -12,
	},
	isPlaying: false,
	isRecording: false,
	isLooping: false,
	currentTime: 0,
	currentTimeRef: { current: 0 },
	masterVolume: 1,
	playbackSpeed: 1,
	recordingTrackIndex: null,
	zoomLevel: 1,
	showAutomation: false,
	markers: [],
	undoStack: [],
	redoStack: [],
	tempoMap: [{ time: 0, bpm: 120 }],
	timeSignature: [4, 4],

	addTrack: (name) => {
		const id = generateTrackId();
		const colors = [
			"hsl(var(--accent))",
			"hsl(142, 76%, 36%)",
			"hsl(248, 90%, 66%)",
			"hsl(27, 96%, 61%)",
			"hsl(340, 82%, 52%)",
			"hsl(190, 90%, 50%)",
		];
		const trackCount = get().tracks.length;
		const track: StudioTrack = {
			id,
			name: name || `Track ${trackCount + 1}`,
			muted: false,
			solo: false,
			volume: 0.8,
			pan: 0,
			audioUrl: null,
			audioBlob: null,
			duration: 0,
			waveformData: null,
			color: colors[trackCount % colors.length],
			showSpectrogram: false,
			stem: null,
			channels: 1,
			pluginChain: [],
			volumeAutomation: [],
			panAutomation: [],
			crossfade: null,
			startOffset: 0,
			trimStart: 0,
			trimEnd: 0,
			midiNotes: [],
			submixId: null,
			generationId: null,
			groupId: null,
			sidechainSourceId: null,
			expanded: false,
		};
		set((state) => ({ tracks: [...state.tracks, track] }));
		return id;
	},

	removeTrack: (id) => {
		set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) }));
	},

	duplicateTrack: (id) => {
		const source = get().tracks.find((t) => t.id === id);
		if (!source) {
			return null;
		}
		const trackCount = get().tracks.length;
		const colors = [
			"hsl(var(--accent))",
			"hsl(142, 76%, 36%)",
			"hsl(248, 90%, 66%)",
			"hsl(27, 96%, 61%)",
			"hsl(340, 82%, 52%)",
			"hsl(190, 90%, 50%)",
		];
		const newId = generateTrackId();
		// audioBlob/audioUrl/waveformData are shared by reference (immutable
		// once set); the decoded AudioBuffer is copied by the caller, which
		// owns the buffer map.
		const copy: StudioTrack = {
			...source,
			id: newId,
			name: `${source.name} copy`,
			color: colors[trackCount % colors.length],
			pluginChain: source.pluginChain.map((p) => ({
				...p,
				params: { ...p.params },
			})),
			volumeAutomation: source.volumeAutomation.map((p) => ({ ...p })),
			panAutomation: source.panAutomation.map((p) => ({ ...p })),
			crossfade: source.crossfade ? { ...source.crossfade } : null,
			midiNotes: [...source.midiNotes],
		};
		set((state) => ({ tracks: [...state.tracks, copy] }));
		return newId;
	},

	moveTrack: (fromIndex, toIndex) => {
		set((state) => {
			const tracks = [...state.tracks];
			const [moved] = tracks.splice(fromIndex, 1);
			tracks.splice(toIndex, 0, moved);
			return { tracks };
		});
	},

	updateTrack: (id, updates) => {
		set((state) => ({
			tracks: state.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
		}));
	},

	setTracks: (tracks) => set({ tracks }),

	setTrackAudio: (id, audioUrl, blob, duration) => {
		set((state) => ({
			tracks: state.tracks.map((t) =>
				t.id === id ? { ...t, audioUrl, audioBlob: blob, duration } : t,
			),
		}));
	},

	addSubmix: (name) => {
		const id = generateSubmixId();
		const submix: Submix = {
			id,
			name,
			sourceTrackIds: [],
			volume: 1,
			pluginChain: [],
		};
		set((state) => ({ submixes: [...state.submixes, submix] }));
		return id;
	},

	removeSubmix: (id) => {
		set((state) => ({
			submixes: state.submixes.filter((s) => s.id !== id),
			tracks: state.tracks.map((t) =>
				t.submixId === id ? { ...t, submixId: null } : t,
			),
		}));
	},

	updateSubmix: (id, updates) => {
		set((state) => ({
			submixes: state.submixes.map((s) =>
				s.id === id ? { ...s, ...updates } : s,
			),
		}));
	},

	setSubmixes: (submixes) => set({ submixes }),

	addGroup: (name) => {
		const id = generateGroupId();
		const group: TrackGroup = { id, name, collapsed: false };
		set((state) => ({ groups: [...state.groups, group] }));
		return id;
	},

	removeGroup: (id) => {
		set((state) => ({
			groups: state.groups.filter((g) => g.id !== id),
			tracks: state.tracks.map((t) =>
				t.groupId === id ? { ...t, groupId: null } : t,
			),
		}));
	},

	renameGroup: (id, name) => {
		set((state) => ({
			groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g)),
		}));
	},

	toggleGroupCollapse: (id) => {
		set((state) => ({
			groups: state.groups.map((g) =>
				g.id === id ? { ...g, collapsed: !g.collapsed } : g,
			),
		}));
	},

	assignTrackToGroup: (trackId, groupId) => {
		set((state) => ({
			tracks: state.tracks.map((t) =>
				t.id === trackId ? { ...t, groupId } : t,
			),
		}));
	},

	toggleGroupMute: (groupId) => {
		set((state) => {
			const groupTracks = state.tracks.filter((t) => t.groupId === groupId);
			const allMuted =
				groupTracks.length > 0 && groupTracks.every((t) => t.muted);
			return {
				tracks: state.tracks.map((t) =>
					t.groupId === groupId ? { ...t, muted: !allMuted } : t,
				),
			};
		});
	},

	toggleGroupSolo: (groupId) => {
		set((state) => {
			const groupTracks = state.tracks.filter((t) => t.groupId === groupId);
			const allSolo =
				groupTracks.length > 0 && groupTracks.every((t) => t.solo);
			return {
				tracks: state.tracks.map((t) =>
					t.groupId === groupId ? { ...t, solo: !allSolo } : t,
				),
			};
		});
	},

	toggleTrackExpanded: (trackId) =>
		set((state) => ({
			tracks: state.tracks.map((t) =>
				t.id === trackId ? { ...t, expanded: !t.expanded } : t,
			),
		})),

	setIsPlaying: (playing) => set({ isPlaying: playing }),
	setIsRecording: (recording) => set({ isRecording: recording }),
	setIsLooping: (looping) => set({ isLooping: looping }),
	setCurrentTime: (time) => {
		get().currentTimeRef.current = time;
	},
	setMasterVolume: (volume) =>
		set({ masterVolume: Math.max(0, Math.min(2, volume)) }),
	setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
	setRecordingTrackIndex: (index) => set({ recordingTrackIndex: index }),
	setZoomLevel: (level) => set({ zoomLevel: level }),
	setShowAutomation: (show) => set({ showAutomation: show }),

	addMarker: (time, label = "") => {
		const marker: TimelineMarker = {
			id: `marker-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
			time,
			label,
		};
		set((state) => ({
			markers: [...state.markers, marker].sort((a, b) => a.time - b.time),
		}));
	},

	removeMarker: (id) => {
		set((state) => ({ markers: state.markers.filter((m) => m.id !== id) }));
	},

	updateMarker: (id, updates) => {
		set((state) => ({
			markers: state.markers
				.map((m) => (m.id === id ? { ...m, ...updates } : m))
				.sort((a, b) => a.time - b.time),
		}));
	},

	addTempoChange: (time, bpm) => {
		set((state) => {
			const filtered = state.tempoMap.filter((t) => t.time !== time);
			return {
				tempoMap: [...filtered, { time, bpm }].sort((a, b) => a.time - b.time),
			};
		});
	},

	removeTempoChange: (index) => {
		set((state) => {
			const filtered = state.tempoMap.filter((_, i) => i !== index);
			if (filtered.length === 0) {
				return { tempoMap: [{ time: 0, bpm: 120 }] };
			}
			return { tempoMap: filtered };
		});
	},

	setTimeSignature: (num, den) => {
		set({ timeSignature: [num, den] });
	},

	getBpmAtTime: (time) => {
		const { tempoMap } = get();
		let bpm = 120;
		for (const tc of tempoMap) {
			if (tc.time <= time) {
				bpm = tc.bpm;
			} else {
				break;
			}
		}
		return bpm;
	},

	toggleMute: (id) => {
		set((state) => ({
			tracks: state.tracks.map((t) =>
				t.id === id ? { ...t, muted: !t.muted } : t,
			),
		}));
	},

	toggleSolo: (id) => {
		set((state) => ({
			tracks: state.tracks.map((t) =>
				t.id === id ? { ...t, solo: !t.solo } : t,
			),
		}));
	},

	setVolume: (id, volume) => {
		const clamped = Math.max(0, Math.min(2, volume));
		set((state) => ({
			tracks: state.tracks.map((t) =>
				t.id === id ? { ...t, volume: clamped } : t,
			),
		}));
	},

	setPan: (id, pan) => {
		const clamped = Math.max(-1, Math.min(1, pan));
		set((state) => ({
			tracks: state.tracks.map((t) =>
				t.id === id ? { ...t, pan: clamped } : t,
			),
		}));
	},

	toggleDucking: () => {
		set((state) => ({
			masterChannel: {
				...state.masterChannel,
				duckingEnabled: !state.masterChannel.duckingEnabled,
			},
		}));
	},

	setDuckingThreshold: (threshold) => {
		set((state) => ({
			masterChannel: {
				...state.masterChannel,
				duckThreshold: threshold,
			},
		}));
	},

	setDuckingGain: (gain) => {
		set((state) => ({
			masterChannel: {
				...state.masterChannel,
				duckGain: gain,
			},
		}));
	},

	setMasterBusSend: (trackId, level) => {
		set((state) => ({
			masterChannel: {
				...state.masterChannel,
				busSendLevels: {
					...state.masterChannel.busSendLevels,
					[trackId]: level,
				},
			},
		}));
	},

	pushUndo: (description, onUndo, onRedo) => {
		const snapshot = takeSnapshot(get);
		set((state) => ({
			undoStack: [
				...state.undoStack.slice(-29),
				{ snapshot, description, onUndo, onRedo },
			],
			redoStack: [],
		}));
	},

	undo: () => {
		const { undoStack, redoStack } = get();
		if (undoStack.length === 0) {
			return;
		}
		const entry = undoStack[undoStack.length - 1];
		const currentSnapshot = takeSnapshot(get);
		set({
			undoStack: undoStack.slice(0, -1),
			redoStack: [
				...redoStack,
				{
					snapshot: currentSnapshot,
					description: entry.description,
					onUndo: entry.onUndo,
					onRedo: entry.onRedo,
				},
			],
			tracks: entry.snapshot.tracks,
			groups: entry.snapshot.groups,
			masterVolume: entry.snapshot.masterVolume,
			playbackSpeed: entry.snapshot.playbackSpeed,
			isLooping: entry.snapshot.isLooping,
			submixes: entry.snapshot.submixes,
			masterChannel: entry.snapshot.masterChannel,
			markers: entry.snapshot.markers,
			tempoMap: entry.snapshot.tempoMap,
			timeSignature: entry.snapshot.timeSignature,
		});
		entry.onUndo?.();
	},

	redo: () => {
		const { redoStack, undoStack } = get();
		if (redoStack.length === 0) {
			return;
		}
		const entry = redoStack[redoStack.length - 1];
		const currentSnapshot = takeSnapshot(get);
		set({
			redoStack: redoStack.slice(0, -1),
			undoStack: [
				...undoStack,
				{
					snapshot: currentSnapshot,
					description: entry.description,
					onUndo: entry.onUndo,
					onRedo: entry.onRedo,
				},
			],
			tracks: entry.snapshot.tracks,
			groups: entry.snapshot.groups,
			masterVolume: entry.snapshot.masterVolume,
			playbackSpeed: entry.snapshot.playbackSpeed,
			isLooping: entry.snapshot.isLooping,
			submixes: entry.snapshot.submixes,
			masterChannel: entry.snapshot.masterChannel,
			markers: entry.snapshot.markers,
			tempoMap: entry.snapshot.tempoMap,
			timeSignature: entry.snapshot.timeSignature,
		});
		entry.onRedo?.();
	},

	exportSession: () => takeSnapshot(get),

	importSession: (snapshot) => {
		// Reset the live playhead ref too — the `currentTime` state field is
		// display-only; playback reads currentTimeRef.
		get().currentTimeRef.current = 0;
		set({
			tracks: snapshot.tracks.map((t) => ({
				...t,
				audioBlob: null,
				audioUrl: null,
				waveformData: null,
				stem: t.stem ?? null,
			})),
			groups: snapshot.groups ?? [],
			masterVolume: snapshot.masterVolume,
			playbackSpeed: snapshot.playbackSpeed,
			isLooping: snapshot.isLooping,
			submixes: snapshot.submixes ?? [],
			masterChannel: snapshot.masterChannel ?? get().masterChannel,
			markers: snapshot.markers ?? [],
			tempoMap: snapshot.tempoMap ?? [{ time: 0, bpm: 120 }],
			timeSignature: snapshot.timeSignature ?? [4, 4],
			undoStack: [],
			redoStack: [],
			currentTime: 0,
			isPlaying: false,
		});
	},

	reset: () => {
		get().currentTimeRef.current = 0;
		set({
			tracks: [],
			groups: [],
			isPlaying: false,
			isRecording: false,
			isLooping: false,
			currentTime: 0,
			masterVolume: 1,
			playbackSpeed: 1,
			recordingTrackIndex: null,
			zoomLevel: 1,
			showAutomation: false,
			markers: [],
			tempoMap: [{ time: 0, bpm: 120 }],
			timeSignature: [4, 4],
			undoStack: [],
			redoStack: [],
		});
	},

	resetToTemplate: (snapshot) => {
		get().currentTimeRef.current = 0;
		set({
			tracks: snapshot.tracks.map((t) => ({
				...t,
				audioBlob: null,
				audioUrl: null,
				waveformData: null,
				stem: t.stem ?? null,
			})),
			groups: snapshot.groups ?? [],
			masterVolume: snapshot.masterVolume,
			playbackSpeed: snapshot.playbackSpeed,
			isLooping: snapshot.isLooping,
			submixes: snapshot.submixes ?? [],
			masterChannel: snapshot.masterChannel ?? {
				volume: 1,
				busSendLevels: {},
				duckingEnabled: false,
				duckThreshold: -30,
				duckGain: -12,
			},
			markers: snapshot.markers ?? [],
			tempoMap: snapshot.tempoMap ?? [{ time: 0, bpm: 120 }],
			timeSignature: snapshot.timeSignature ?? [4, 4],
			isPlaying: false,
			isRecording: false,
			currentTime: 0,
			recordingTrackIndex: null,
			zoomLevel: 1,
			showAutomation: false,
			undoStack: [],
			redoStack: [],
		});
	},
}));
