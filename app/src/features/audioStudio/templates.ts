import type { AudioStudioSnapshot } from "./AudioStudioStore";

export interface ProjectTemplate {
	id: string;
	name: string;
	description: string;
	trackCount: number;
	snapshot: AudioStudioSnapshot;
}

const COLORS = [
	"hsl(340 70% 60%)",
	"hsl(210 70% 60%)",
	"hsl(150 60% 50%)",
	"hsl(40 80% 55%)",
	"hsl(280 60% 60%)",
	"hsl(0 70% 55%)",
];

function track(
	name: string,
	colorIndex: number,
	overrides: Partial<AudioStudioSnapshot["tracks"][number]> = {},
): AudioStudioSnapshot["tracks"][number] {
	return {
		id: `template-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
		name,
		muted: false,
		solo: false,
		volume: 0.8,
		pan: 0,
		audioUrl: null,
		audioBlob: null,
		duration: 0,
		waveformData: null,
		color: COLORS[colorIndex % COLORS.length],
		showSpectrogram: false,
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
		...overrides,
	};
}

function snapshot(
	tracks: AudioStudioSnapshot["tracks"],
	masterOverrides: Partial<AudioStudioSnapshot> = {},
): AudioStudioSnapshot {
	return {
		tracks,
		masterVolume: 1,
		playbackSpeed: 1,
		isLooping: false,
		submixes: [],
		masterChannel: {
			volume: 1,
			busSendLevels: {},
			duckingEnabled: false,
			duckThreshold: -30,
			duckGain: -12,
		},
		markers: [],
		...masterOverrides,
	};
}

const blank: ProjectTemplate = {
	id: "blank",
	name: "Blank",
	description: "Start from scratch with one empty track",
	trackCount: 1,
	snapshot: snapshot([track("Track 1", 0)]),
};

const podcast: ProjectTemplate = {
	id: "podcast",
	name: "Podcast",
	description: "Two hosts with compression, gating, and intro music ducking",
	trackCount: 4,
	snapshot: snapshot(
		[
			track("Host", 0, {
				volume: 0.9,
				pluginChain: [
					{
						pluginId: "builtin-compressor",
						pluginName: "Compressor",
						enabled: true,
						params: { threshold: 0.12, ratio: 4, attack: 0.003, release: 0.1 },
					},
					{
						pluginId: "builtin-eq",
						pluginName: "EQ",
						enabled: true,
						params: { frequency: 80, gain: -2, q: 0.7 },
					},
				],
			}),
			track("Guest", 1, {
				volume: 0.85,
				pluginChain: [
					{
						pluginId: "builtin-compressor",
						pluginName: "Compressor",
						enabled: true,
						params: { threshold: 0.12, ratio: 4, attack: 0.003, release: 0.1 },
					},
					{
						pluginId: "builtin-eq",
						pluginName: "EQ",
						enabled: true,
						params: { frequency: 80, gain: -2, q: 0.7 },
					},
				],
			}),
			track("Intro Music", 2, {
				volume: 0.5,
				pan: -0.3,
			}),
			track("Outro Music", 3, {
				volume: 0.5,
				pan: 0.3,
			}),
		],
		{
			masterChannel: {
				volume: 1,
				busSendLevels: {},
				duckingEnabled: true,
				duckThreshold: -24,
				duckGain: -10,
			},
		},
	),
};

const musicBed: ProjectTemplate = {
	id: "music-bed",
	name: "Music Bed",
	description: "Four-layer music arrangement with reverb and ambient space",
	trackCount: 4,
	snapshot: snapshot(
		[
			track("Rhythm", 0, {
				volume: 0.8,
				pluginChain: [
					{
						pluginId: "builtin-compressor",
						pluginName: "Compressor",
						enabled: true,
						params: { threshold: 0.15, ratio: 3, attack: 0.005, release: 0.08 },
					},
				],
			}),
			track("Melody", 1, {
				volume: 0.7,
				pan: -0.2,
				pluginChain: [
					{
						pluginId: "builtin-reverb",
						pluginName: "Reverb",
						enabled: true,
						params: { mix: 0.25 },
					},
				],
			}),
			track("Bass", 2, {
				volume: 0.75,
				pluginChain: [
					{
						pluginId: "builtin-eq",
						pluginName: "EQ",
						enabled: true,
						params: { frequency: 120, gain: 3, q: 1 },
					},
				],
			}),
			track("Ambient", 3, {
				volume: 0.4,
				pan: 0.4,
				pluginChain: [
					{
						pluginId: "builtin-reverb",
						pluginName: "Reverb",
						enabled: true,
						params: { mix: 0.4 },
					},
					{
						pluginId: "builtin-delay",
						pluginName: "Delay",
						enabled: true,
						params: { time: 0.35, feedback: 0.25, mix: 0.2 },
					},
				],
			}),
		],
		{ isLooping: true },
	),
};

const voiceover: ProjectTemplate = {
	id: "voiceover",
	name: "Voiceover",
	description:
		"Polished VO chain with compression, de-ess, and background ducking",
	trackCount: 3,
	snapshot: snapshot(
		[
			track("Voice", 0, {
				volume: 0.9,
				pluginChain: [
					{
						pluginId: "builtin-compressor",
						pluginName: "Compressor",
						enabled: true,
						params: { threshold: 0.1, ratio: 5, attack: 0.002, release: 0.08 },
					},
					{
						pluginId: "builtin-eq",
						pluginName: "EQ",
						enabled: true,
						params: { frequency: 3000, gain: 2, q: 1.2 },
					},
					{
						pluginId: "builtin-eq",
						pluginName: "EQ (Low Cut)",
						enabled: true,
						params: { frequency: 80, gain: -6, q: 0.7 },
					},
				],
			}),
			track("Background", 1, {
				volume: 0.3,
				pluginChain: [
					{
						pluginId: "builtin-eq",
						pluginName: "EQ",
						enabled: true,
						params: { frequency: 500, gain: -3, q: 1 },
					},
				],
			}),
			track("SFX", 2, {
				volume: 0.5,
			}),
		],
		{
			masterChannel: {
				volume: 1,
				busSendLevels: {},
				duckingEnabled: true,
				duckThreshold: -24,
				duckGain: -10,
			},
		},
	),
};

const audiobook: ProjectTemplate = {
	id: "audiobook",
	name: "Audiobook",
	description: "Narrator with character voices, music bed, and chapter markers",
	trackCount: 4,
	snapshot: snapshot(
		[
			track("Narrator", 0, {
				volume: 0.9,
				pluginChain: [
					{
						pluginId: "builtin-compressor",
						pluginName: "Compressor",
						enabled: true,
						params: { threshold: 0.1, ratio: 4, attack: 0.003, release: 0.1 },
					},
					{
						pluginId: "builtin-eq",
						pluginName: "EQ",
						enabled: true,
						params: { frequency: 80, gain: -3, q: 0.7 },
					},
					{
						pluginId: "builtin-eq",
						pluginName: "Presence",
						enabled: true,
						params: { frequency: 4000, gain: 1.5, q: 1.5 },
					},
				],
			}),
			track("Character A", 1, {
				volume: 0.85,
				pan: -0.15,
				pluginChain: [
					{
						pluginId: "builtin-compressor",
						pluginName: "Compressor",
						enabled: true,
						params: { threshold: 0.12, ratio: 3, attack: 0.003, release: 0.1 },
					},
				],
			}),
			track("Character B", 2, {
				volume: 0.85,
				pan: 0.15,
				pluginChain: [
					{
						pluginId: "builtin-compressor",
						pluginName: "Compressor",
						enabled: true,
						params: { threshold: 0.12, ratio: 3, attack: 0.003, release: 0.1 },
					},
				],
			}),
			track("Music Bed", 3, {
				volume: 0.35,
				pluginChain: [
					{
						pluginId: "builtin-reverb",
						pluginName: "Reverb",
						enabled: true,
						params: { mix: 0.2 },
					},
				],
			}),
		],
		{
			markers: [{ id: "ch-1", time: 0, label: "Chapter 1" }],
		},
	),
};

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
	blank,
	podcast,
	musicBed,
	voiceover,
	audiobook,
];
